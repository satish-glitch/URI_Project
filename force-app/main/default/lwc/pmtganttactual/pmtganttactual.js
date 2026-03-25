import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import fetchTasks      from '@salesforce/apex/PMTGanttActualController.fetchTasks';
import fetchProject    from '@salesforce/apex/PMTGanttActualController.fetchProject';
import saveActualDates from '@salesforce/apex/PMTGanttActualController.saveActualDates';

// How many weeks to show in the timeline
const WEEKS = 20;

export default class PmtGanttActual extends LightningElement {

    @api recordId;

    @track isLoading       = true;
    @track projectName     = '';
    @track showModal       = false;
    @track modalTaskId     = '';
    @track modalTaskName   = '';
    @track modalPlannedStart = '';
    @track modalPlannedEnd   = '';
    @track modalActualStart  = '';
    @track modalActualEnd    = '';

    _wiredTasksResult = [];
    _tasks            = [];
    _tlStart          = null;   // timeline start (Date)
    _tlEnd            = null;   // timeline end   (Date)
    _totalMs          = 0;

    // ── Wire project ─────────────────────────────────────────────────────
    @wire(fetchProject, { projectId: '$recordId' })
    wiredProject({ data }) {
        if (data) this.projectName = data.Name;
    }

    // ── Wire tasks ───────────────────────────────────────────────────────
    @wire(fetchTasks, { projectId: '$recordId' })
    wiredTasks(result) {
        this._wiredTasksResult = result;
        if (result.data) {
            this._tasks = result.data;
            this._buildTimeline();
            this.isLoading = false;
        } else if (result.error) {
            this._toast('Error', result.error.body?.message || 'Failed to load', 'error');
            this.isLoading = false;
        }
    }

    // ── Build timeline window ─────────────────────────────────────────────
    _buildTimeline() {
        // Earliest planned start date OR today
        const allStarts = this._tasks
            .map(t => t.inov8__Start_Date__c)
            .filter(Boolean)
            .map(d => new Date(d + 'T00:00:00'));

        const earliest = allStarts.length
            ? new Date(Math.min(...allStarts.map(d => d.getTime())))
            : new Date();

        // Snap to Monday of that week
        const snap = new Date(earliest);
        const day  = snap.getDay();                       // 0=Sun
        const diff = (day === 0) ? -6 : 1 - day;         // Monday offset
        snap.setDate(snap.getDate() + diff);
        snap.setHours(0, 0, 0, 0);

        this._tlStart  = snap;
        this._tlEnd    = new Date(snap.getTime() + WEEKS * 7 * 86400000);
        this._totalMs  = this._tlEnd - this._tlStart;
    }

    // ── Week header labels ────────────────────────────────────────────────
    get timelineWeeks() {
        if (!this._tlStart) return [];
        return Array.from({ length: WEEKS }, (_, i) => {
            const d = new Date(this._tlStart.getTime() + i * 7 * 86400000);
            const mon = d.toLocaleString('default', { month: 'short' });
            return { key: `wk-${i}`, label: `${mon} ${String(d.getDate()).padStart(2,'0')}` };
        });
    }

    // ── Today line position ───────────────────────────────────────────────
    get todayStyle() {
        if (!this._tlStart) return 'display:none';
        const pct = ((Date.now() - this._tlStart) / this._totalMs * 100).toFixed(2);
        if (pct < 0 || pct > 100) return 'display:none';
        return `left:${pct}%`;
    }

    // ── Enrich tasks ──────────────────────────────────────────────────────
    get enrichedTasks() {
        if (!this._tlStart || !this._tasks.length) return [];

        let lastPhase = null;
        return this._tasks.map((t, idx) => {
            const phaseName = t.inov8__Phase__r?.Name || 'No Phase';
            const showPhase = phaseName !== lastPhase;
            if (showPhase) lastPhase = phaseName;

            // Planned bar
            const ps = t.inov8__Start_Date__c ? new Date(t.inov8__Start_Date__c + 'T00:00:00') : null;
            const pe = t.inov8__End_Date__c   ? new Date(t.inov8__End_Date__c   + 'T00:00:00') : null;
            const hasPlanned = !!(ps && pe);
            const plannedStyle = hasPlanned ? this._barStyle(ps, pe) : '';
            const plannedDateLabel = hasPlanned ? `${this._fmt(ps)} – ${this._fmt(pe)}` : '';
            const plannedTitle     = plannedDateLabel;

            // Actual bar
            const as_ = t.Actual_Start_Date__c ? new Date(t.Actual_Start_Date__c + 'T00:00:00') : null;
            const ae  = t.Actual_End_Date__c   ? new Date(t.Actual_End_Date__c   + 'T00:00:00') : null;
            const hasActual = !!(as_ && ae);
            const actualStyle     = hasActual ? this._barStyle(as_, ae, true) : '';
            const actualDateLabel = hasActual ? `${this._fmt(as_)} – ${this._fmt(ae)}` : '';
            const actualTitle     = actualDateLabel;

            // Variance
            let variance = '';
            let varianceClass = 'var-chip';
            if (hasPlanned && hasActual) {
                const days = Math.round((ae - pe) / 86400000);
                if (days > 0) {
                    variance = `+${days}d late`;
                    varianceClass = 'var-chip var-late';
                } else if (days < 0) {
                    variance = `${Math.abs(days)}d early`;
                    varianceClass = 'var-chip var-early';
                } else {
                    variance = 'On time ✓';
                    varianceClass = 'var-chip var-ontime';
                }
            }

            return {
                ...t,
                phaseName,
                showPhase,
                phaseKey      : `phase-${idx}`,
                plannedRowKey : `p-${t.Id}`,
                actualRowKey  : `a-${t.Id}`,
                hasPlanned, plannedStyle, plannedDateLabel, plannedTitle,
                hasActual,  actualStyle,  actualDateLabel,  actualTitle,
                variance,   varianceClass,
            };
        });
    }

    get hasTasks() { return this._tasks.length > 0; }

    // ── Bar style: left% + width% ─────────────────────────────────────────
    _barStyle(start, end, isActual = false) {
        const clampedStart = new Date(Math.max(start.getTime(), this._tlStart.getTime()));
        const clampedEnd   = new Date(Math.min(end.getTime(),   this._tlEnd.getTime()));
        if (clampedStart >= clampedEnd) return 'display:none';

        const left  = ((clampedStart - this._tlStart) / this._totalMs * 100).toFixed(3);
        const width = ((clampedEnd   - clampedStart)  / this._totalMs * 100).toFixed(3);

        // Colour matches PMT exactly:
        //   Planned = teal #4FC3CF (same as standard PMT task bar)
        //   Actual  = amber #F59E0B
        const bg = isActual ? '#F59E0B' : '#4FC3CF';
        return `left:${left}%;width:${width}%;background:${bg};`;
    }

    _fmt(d) {
        return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
    }

    // ── Modal ─────────────────────────────────────────────────────────────
    openModal(evt) {
        const { id, name, ps, pe, as: as_, ae } = evt.currentTarget.dataset;
        this.modalTaskId      = id;
        this.modalTaskName    = name;
        this.modalPlannedStart = ps || '—';
        this.modalPlannedEnd   = pe || '—';
        this.modalActualStart  = as_ || '';
        this.modalActualEnd    = ae  || '';
        this.showModal = true;
    }

    closeModal() { this.showModal = false; }

    handleInput(evt) {
        this[evt.target.dataset.field] = evt.detail.value;
    }

    async saveActual() {
        if (!this.modalActualStart || !this.modalActualEnd) {
            this._toast('Validation', 'Please fill both Actual Start and End dates.', 'warning');
            return;
        }
        if (this.modalActualEnd < this.modalActualStart) {
            this._toast('Validation', 'Actual End must be on or after Actual Start.', 'warning');
            return;
        }
        this.isLoading = true;
        try {
            await saveActualDates({
                taskId          : this.modalTaskId,
                actualStartDate : this.modalActualStart,
                actualEndDate   : this.modalActualEnd
            });
            this._toast('Success', 'Actual dates saved!', 'success');
            this.closeModal();
            await refreshApex(this._wiredTasksResult);
        } catch (e) {
            this._toast('Error', e.body?.message || 'Save failed.', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    _toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}