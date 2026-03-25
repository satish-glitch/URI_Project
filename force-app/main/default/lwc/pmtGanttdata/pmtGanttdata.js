/*
 * Name : pmtGanttdata
 * Description : Child component to render Projects/Phases/Tasks on PMT Gantt
 * Version     : 57 - Added actual start/end date bar rendering
 */
import { LightningElement, api } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { deleteRecord } from 'lightning/uiRecordApi';
import saveTask from '@salesforce/apex/PMT_GanttCtrl.saveTask';
import { NavigationMixin } from 'lightning/navigation';
import LightningConfirm from 'lightning/confirm';

export default class PmtGanttdata extends NavigationMixin(LightningElement) {
    record;
    recordurl;
    recordPageRef;
    @api tempVariable;
    @api startDate;
    @api endDate;
    @api dateIncrement;

    @api
    get project() {
        return this._project;
    }
    set project(_project) {
        this._project = _project;
        this.setVisibility();
    }

    connectedCallback() {
        this.refreshDates(this.startDate, this.endDate, this.dateIncrement);
        this.recordPageRef = {
            type: 'standard__recordPage',
            attributes: {
                recordId: this.record.id,
                actionName: 'view'
            }
        };
        this[NavigationMixin.GenerateUrl](this.recordPageRef)
            .then(url => this.recordurl = url);
    }

    // ── Getters ─────────────────────────────────────────────────────────────

    get isPMTTask() {
        return this.record.objAPIName === 'PMT_Task__c';
    }

    get isPMTProject() {
        return this.record.objAPIName === 'PMT_Project__c';
    }

    get isPMTPhase() {
        return this.record.objAPIName === 'PMT_Phase__c';
    }

    // Show actual bar only for tasks that have actual_left populated
    get hasActualDates() {
        return (
            this.record.objAPIName === 'PMT_Task__c' &&
            this.record.actual_left != null &&
            this.record.actual_right != null
        );
    }

    // Tooltip text for the actual bar
    get actualBarTitle() {
        return 'Actual: ' +
            (this.record.actual_start_date
                ? new Date(this.record.actual_start_date).toLocaleDateString()
                : '?') +
            ' - ' +
            (this.record.actual_end_date
                ? new Date(this.record.actual_end_date).toLocaleDateString()
                : '?');
    }

    // ── Click handler ────────────────────────────────────────────────────────

    handleOnClick(event) {
        try {
            var recordId = (event.currentTarget.id).split('-')[0];
            var action = event.currentTarget.name || 'showdata';

            switch (action) {
                case 'edit':
                    this.navigateToRecord(recordId, 'edit');
                    break;

                case 'delete':
                    LightningConfirm.open({
                        message: 'Are you sure you want to delete the record?',
                        label: 'Delete Record',
                    }).then((result) => {
                        if (result === true) {
                            this.deleteAction(this.record.id);
                        }
                    });
                    break;

                case 'view':
                    event.preventDefault();
                    event.stopPropagation();
                    this[NavigationMixin.Navigate](this.recordPageRef);
                    break;

                default:
                    this.dispatchEvent(new CustomEvent('calleventhandler', {
                        detail: { recordId: recordId, type: action }
                    }));
                    break;
            }
        } catch (Exception) {
            this.showToastMessage('Error', 'Error while clicking on actions', 'error');
        }
    }

    navigateToRecord(recId, action) {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId: recId, actionName: action }
        });
    }

    deleteAction(recordId) {
        deleteRecord(recordId)
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Success',
                    message: 'Record deleted',
                    variant: 'success'
                }));
            })
            .catch(() => {
                this.showToastMessage('Error', 'Error while deleting record, please contact system administrator.', 'error');
            });
    }

    // ── Date helpers ─────────────────────────────────────────────────────────

    addMonthsToDate(numOfMonths, date) {
        date.setMonth(date.getMonth() + numOfMonths);
        return date;
    }

    getLastDayOfQuarter(date) {
        let _date = new Date(date);
        _date = this.addMonthsToDate(2, _date);
        return new Date(_date.getFullYear(), _date.getMonth() + 1, 0);
    }

    getDaysBetweenDates(firstDate, secondDate) {
        let days = 0;
        let dateIncrement = 0;
        for (let date = new Date(firstDate); date < secondDate; date.setDate(date.getDate() + dateIncrement)) {
            dateIncrement = this.getLastdayOfMonth(date);
            days += dateIncrement;
        }
        return days;
    }

    getLastdayOfMonth(date) {
        let _date = new Date(date);
        return new Date(_date.getFullYear(), _date.getMonth() + 1, 0).getDate();
    }

    getYYYYMMDD(d) {
        try {
            const _d = new Date(d);
            return new Date(_d.getTime() - _d.getTimezoneOffset() * 60 * 1000)
                .toISOString().split('T')[0];
        } catch (Exception) {
            this.showToastMessage('Error', 'Error during date calculation', 'error');
        }
    }

    // ── Refresh dates / slot building ────────────────────────────────────────

    @api
    refreshDates(startDate, endDate, dateIncrement) {
        try {
            let dateIncrementNew = dateIncrement;

            if (endDate && dateIncrementNew) {
                let times = [];
                let today = new Date();
                today.setHours(0, 0, 0, 0);
                today = today.getTime();

                if (dateIncrementNew === 92) {
                    this.viewType = "View by Year";
                } else if (dateIncrementNew === 1) {
                    this.viewType = "View by Day";
                } else if (dateIncrementNew === 7) {
                    const timeDiff = Math.abs(endDate.getTime() - startDate.getTime());
                    const diffDays = Math.floor(timeDiff / (1000 * 3600 * 24));
                    this.viewType = (diffDays === 139) ? "View by Month" : "View by Week";
                }

                for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + dateIncrementNew)) {
                    let time = {
                        class: "slds-col lwc-timeslot",
                        start: date.getTime()
                    };

                    if (dateIncrementNew > 1) {
                        let end = new Date(date);
                        if (this.viewType === "View by Year") {
                            end = this.getLastDayOfQuarter(date);
                            dateIncrementNew = this.getDaysBetweenDates(date, end);
                        } else {
                            end.setDate(end.getDate() + dateIncrementNew - 1);
                        }
                        time.end = end.getTime();
                    } else {
                        time.end = date.getTime();
                    }

                    if (today >= time.start && today <= time.end) {
                        time.class += " lwc-is-today";
                    }

                    switch (this.viewType) {
                        case "View by Day":
                            if (date.getDay() === 0) { time.class += " lwc-is-week-end"; }
                            break;
                        case "View by Week": {
                            let year = new Date(new Date(time.end).getFullYear(), 0, 1);
                            let days = Math.floor((new Date(time.end) - year) / (24 * 60 * 60 * 1000));
                            if (Math.ceil((new Date(time.end).getDay() + 1 + days) / 7) % 2 === 0) {
                                time.class += " lwc-is-week-end";
                            }
                            break;
                        }
                        case "View by Month":
                            if (date.getMonth() !== moment(date).add(dateIncrement, "days").toDate().getMonth()) {
                                time.class += " lwc-is-week-end";
                            }
                            break;
                        case "View by Year":
                            if (date.getFullYear() !== moment(date).add(3, "months").toDate().getFullYear()) {
                                time.class += " lwc-is-week-end";
                            }
                            break;
                        default:
                            break;
                    }
                    times.push(time);
                }

                this.times = times;
                this.startDate = startDate;
                this.endDate = endDate;
                this.dateIncrement = dateIncrementNew;
                this.setVisibility();
            }
        } catch (Exception) {
            this.showToastMessage("Error", "Error while refreshing dates", "error");
        }
    }

    // ── Visibility & styling ─────────────────────────────────────────────────

    setVisibility() {
        var recordToShow = { ...this.project };
        recordToShow.class = this.calcClass(this.project);
        recordToShow.class = recordToShow.class + ' ' + this.project.id;
        recordToShow.style = this.calcStyle(this.project);

         // TEMP DEBUG — remove after confirming
    if (this.project.objAPIName === 'PMT_Task__c') {
        console.log('TASK actual_left:', this.project.actual_left);
        console.log('TASK actual_right:', this.project.actual_right);
        console.log('TASK actual_start_date:', this.project.actual_start_date);
        console.log('TASK actual_end_date:', this.project.actual_end_date);
    }

    recordToShow.class       = this.calcClass(this.project);
    recordToShow.class       = recordToShow.class + ' ' + this.project.id;
    recordToShow.style       = this.calcStyle(this.project);

        // ── Compute actual bar style ──────────────────────────────────────────
        if (
            this.project.objAPIName === 'PMT_Task__c' &&
            this.project.actual_left != null &&
            this.project.actual_right != null &&
            this.times
        ) {
            recordToShow.actualStyle = this.calcActualStyle(this.project);
        } else {
            recordToShow.actualStyle = null;
        }
        // ─────────────────────────────────────────────────────────────────────

        this.record = recordToShow;
    }

    calcClass(record) {
        return ["slds-is-absolute", "lwc-allocation"].join(" ");
    }

    // Planned bar style (unchanged from original)
    calcStyle(record) {
        try {
            if (!this.times) { return; }

            const totalSlots = this.times.length;
            let styles = [
                'left: '  + (record.left / totalSlots) * 100 + '%',
                'right: ' + ((totalSlots - (record.right + 1)) / totalSlots) * 100 + '%'
            ];

            const colorMap = {
                PMT_Project__c: "#6B8CAE",
                PMT_Phase__c:   "#7A9E7E",
                PMT_Task__c:    "#034eee"
            };

            var backgroundColor = record.isMilestone ? "#9B84B8" : colorMap[record.objAPIName];
            styles.push("background-color: " + backgroundColor);

            if (!isNaN(this.dragInfo.startIndex)) {
                styles.push('pointer-events: auto');
                styles.push('transition: left ease 250ms, right ease 250ms');
            } else {
                styles.push('pointer-events: auto');
                styles.push('transition: none');
            }
            return styles.join('; ');
        } catch (Exception) {
            this.showToastMessage('Error', 'Error during style calculation', 'error');
        }
    }

    // ── NEW: Actual bar style ─────────────────────────────────────────────────
    calcActualStyle(record) {
        try {
            if (!this.times) { return ''; }
            const totalSlots = this.times.length;
            const aLeft  = Math.max(0, record.actual_left);
            const aRight = Math.min(totalSlots - 1, record.actual_right);
            return [
                'left: '  + (aLeft / totalSlots) * 100 + '%',
                'right: ' + ((totalSlots - (aRight + 1)) / totalSlots) * 100 + '%',
                'pointer-events: none'
            ].join('; ');
        } catch (Exception) {
            this.showToastMessage('Error', 'Error during actual style calculation', 'error');
            return '';
        }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Save task (drag) ─────────────────────────────────────────────────────

    _saveTask(taskRec) {
        return saveTask(taskRec)
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({
                    message: 'Task Saved Successfully!',
                    variant: "success"
                }));
                this.dispatchEvent(new CustomEvent('calleventhandler', {
                    detail: { recordId: '', type: 'refreshData' }
                }));
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({
                    message: error.body.message,
                    variant: "error"
                }));
            });
    }

    // ── Drag/Drop ────────────────────────────────────────────────────────────

    dragInfo = {};

    handleDragStart(event) {
        try {
            let container = this.template.querySelector('.' + event.currentTarget.dataset.id);
            container.style.opacity = 0;
            setTimeout(function () { container.style.pointerEvents = 'none'; }, 0);
        } catch (Exception) {
            this.showToastMessage('Error', 'Error during drag start', 'error');
        }
    }

    handleLeftDragStart(event) {
        this.dragInfo.direction = "left";
        this.handleDragStart(event);
    }

    handleRightDragStart(event) {
        this.dragInfo.direction = "right";
        this.handleDragStart(event);
    }

    handleDragEnd(event) {
        try {
            event.preventDefault();
            const allocation = this.dragInfo.newAllocation;
            if (typeof allocation !== 'undefined') {
                if (this.record.objAPIName === 'PMT_Task__c') {
                    this._saveTask({
                        taskId:    this.record.id,
                        startDate: new Date(allocation.start_date),
                        endDate:   new Date(allocation.end_date)
                    });
                    this.dragInfo = {};
                } else {
                    this.showToastMessage('Warning', 'Please note only Task timeline can be updated from Gantt view', 'warning');
                }
            }
        } catch (Exception) {
            this.showToastMessage('Error', 'Error during drag end', 'error');
        }
    }

    handleDragEnter(event) {
        try {
            const direction = this.dragInfo.direction;
            const start     = new Date(parseInt(event.currentTarget.dataset.start, 10));
            const end       = new Date(parseInt(event.currentTarget.dataset.end,   10));
            const index     = parseInt(event.currentTarget.dataset.index, 10);

            if (isNaN(this.dragInfo.startIndex)) {
                this.dragInfo.startIndex = index;
            }

            let allocation = JSON.parse(JSON.stringify(this.project));

            switch (direction) {
                case "left":
                    if (index <= allocation.right) {
                        allocation.start_date = this.getYYYYMMDD(start);
                        allocation.left = index;
                    } else {
                        allocation = this.dragInfo.newAllocation;
                    }
                    break;
                case "right":
                    if (index >= allocation.left) {
                        allocation.end_date = this.getYYYYMMDD(end);
                        allocation.right = index;
                    } else {
                        allocation = this.dragInfo.newAllocation;
                    }
                    break;
                default: {
                    let deltaIndex = index - this.dragInfo.startIndex;
                    let firstSlot  = this.times[0];
                    let startDate  = new Date(firstSlot.start);
                    let endDate    = new Date(firstSlot.end);
                    allocation.left  += deltaIndex;
                    allocation.right += deltaIndex;
                    startDate.setDate(startDate.getDate() + allocation.left  * this.dateIncrement);
                    endDate.setDate(  endDate.getDate()   + allocation.right * this.dateIncrement);
                    allocation.start_date = this.getYYYYMMDD(startDate);
                    allocation.end_date   = this.getYYYYMMDD(endDate);
                    break;
                }
            }

            this.dragInfo.newAllocation = allocation;
            this.template.querySelector("." + allocation.id).style = this.calcStyle(allocation);
        } catch (Exception) {
            this.showToastMessage('Error', 'Please set the Start/End date for Task', 'warning');
        }
    }

    // ── Toast ────────────────────────────────────────────────────────────────

    showToastMessage(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}