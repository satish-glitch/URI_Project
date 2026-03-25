/*
 * Name : PMT_Gantt
 * Description : LWC Component to render headers & process the data required for Gantt view
 * Version : 57 - Added actual start/end date bar support
 */
import { LightningElement, api, track, wire } from "lwc";
import { refreshApex } from "@salesforce/apex";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { loadScript } from "lightning/platformResourceLoader";
import { encodeDefaultFieldValues } from 'lightning/pageReferenceUtils';
import { NavigationMixin } from 'lightning/navigation';
import fetchGanttData from '@salesforce/apex/PMT_GanttCtrl.fetchGanttData';
import ganttJS from "@salesforce/resourceUrl/PMT_Gantt";

export default class pmtGantt1 extends NavigationMixin(LightningElement) {
    @api projectId;
    @api projectProgress;
    @api projectHealth;
    @api systemImpacted;
    @api projectCategory;
    @api programSelected;
    @api projectSelected;
    @api recordId;
    @api defaultView;
    @api objectApiName;
    @track startDate;
    @track endDate;
    @track myprojflag;
    @track mytaskflag;
    @track followprojflag;
    @track isResourceView;
    @track isProjectView;
    @track isRecordTypeView;
    @track startDateUTC;
    @track endDateUTC;
    @track formattedStartDate;
    @track formattedEndDate;
    @track dates = [];

    wiredGanttResult;
    error;
    dataToShow = [];
    dataBkp = [];
    expandedData = [];
    scaleType = false;
    isExpandedCheck = true;
    isExpandAll = true;
    isLoading = false;
    taskCheck = false;
    followProject = false;
    projectCheck = false;
    filtersCheck = false;
    filtersToShow = false;
    toastCheck = false;
    dateShift = 7;
    newStartDate;
    selectedView = 'View by Week';
    dataStyle;
    headerStyle;
    sortByValue = 'Start_Date__c Asc';
    showProjLMTMessage = false;

    @track view = {
        options: [
            { label: "View by Day",   value: "1/20" },
            { label: "View by Week",  value: "7/6"  },
            { label: "View by Month", value: "7/20" },
            { label: "View by Year",  value: "4/16" }
        ],
        slotSize: 1,
        slots: 1
    };

    @track sortBy = {
        options: [
            { label: "Start Date Ascending",  value: "Start_Date__c Desc" },
            { label: "Start Date Descending", value: "Start_Date__c Asc"  },
            { label: "End Date Ascending",    value: "Due_Date__c Desc"   },
            { label: "End Date Descending",   value: "Due_Date__c Asc"    }
        ]
    };

    connectedCallback() {
        if (this.projectId != '') {
            this.dataStyle  = "width:100%;";
            this.headerStyle = "width:100%; position: sticky; top:0px; z-index:100; background-color: white;";
        } else {
            this.filtersToShow = true;
            this.dataStyle  = "width:100%";
            this.headerStyle = "width:100%; position: sticky; top:0px; z-index:100; background-color: white;";
        }

        Promise.all([loadScript(this, ganttJS)]).then(() => {
            switch (this.defaultView) {
                case "View by Day":
                    this.setView("1/20");
                    break;
                default:
                    this.setView("7/20");
            }
            this.setStartDate(new Date());
            refreshApex(this.wiredGanttResult);
        });
    }

    setStartDate(_startDate) {
        try {
            if (_startDate instanceof Date && !isNaN(_startDate)) {
                if (this.scaleType) {
                    this.startDate = _startDate;
                } else {
                    _startDate.setHours(0, 0, 0, 0);
                    this.datePickerString = _startDate.toISOString();
                    this.startDate = moment(_startDate).day(1).toDate();
                }
                this.startDateUTC = this.startDate;
                this.formattedStartDate = this.startDate.toLocaleDateString();
                this.setDateHeaders();
            } else {
                this.dispatchEvent(new ShowToastEvent({ message: "Invalid Date", variant: "error" }));
            }
        } catch (Exception) {
            this.showToastMessage('Error', 'Error while setting start date', 'error');
        }
    }

    getFirstDayOfYear(year) { return new Date(year, 0, 1);  }
    getLastDayOfYear(year)  { return new Date(year, 11, 31); }

    setDateHeaders() {
        try {
            this.newStartDate = this.startDate;
            var headerType       = "MMMM";
            var headerFormat     = "YYYYMM";
            var incrementType    = "days";
            var slotEndDateCalc  = this.view.slotSize - 1;
            var skipValue        = this.view.slotSize;

            if (this.view.slots == '16') {
                headerType      = "YYYY";
                this.scaleType  = true;
                incrementType   = "months";
                skipValue       = 3;
                slotEndDateCalc = 3;
                headerFormat    = "YYYY";
                const currentYear   = this.startDate.getFullYear();
                this.newStartDate   = this.getFirstDayOfYear(currentYear);
                this.endDate        = this.getLastDayOfYear(currentYear + 3);
                this.view.slotSize  = 92;
                this.startDate      = this.newStartDate;
            } else {
                this.scaleType = false;
                this.endDate   = moment(this.newStartDate).add(this.view.slots * this.view.slotSize - 1, "days").toDate();
                this.endDateUTC = moment(this.endDate).utc().valueOf() - moment(this.endDate).utcOffset() * 60 * 1000 + "";
            }

            this.formattedStartDate = this.newStartDate.toLocaleDateString();
            this.formattedEndDate   = this.endDate.toLocaleDateString();

            let today = new Date();
            today.setHours(0, 0, 0, 0);
            today = today.getTime();

            let dates = {};

            for (let date = moment(this.newStartDate); date <= moment(this.endDate); date.add(skipValue, incrementType)) {
                let index = date.format(headerFormat);

                if (!dates[index]) {
                    dates[index] = { dayName: '', name: date.format(headerType), days: [] };
                }

                let day = {
                    class: "slds-col slds-p-vertical_x-small slds-m-top_x-small lwc-timeline_day",
                    label: date.format("MM/DD"),
                    start: date.toDate()
                };

                if (this.view.slotSize > 1) {
                    let end = moment(date).add(slotEndDateCalc, incrementType);
                    day.end = end.toDate();
                } else {
                    day.end     = date.toDate();
                    day.dayName = date.format("ddd");
                    if (date.day() === 0) {
                        day.class = day.class + " lwc-is-week-end";
                    }
                }

                if (today >= day.start && today <= day.end) {
                    day.class += " lwc-is-today";
                }

                switch (this.view.value) {
                    case "1/20": {
                        if (date.day() === 0) { day.class = day.class + " lwc-is-week-end"; }
                        break;
                    }
                    case "7/6": {
                        let year = new Date(day.end.getFullYear(), 0, 1);
                        let days = Math.floor((day.end - year) / (24 * 60 * 60 * 1000));
                        if (Math.ceil((day.end.getDay() + 1 + days) / 7) % 2 === 0) {
                            day.class = day.class + " lwc-is-week-end";
                        }
                        break;
                    }
                    case "7/20": {
                        if (date.month() !== moment(date).add(slotEndDateCalc + 1, incrementType).toDate().getMonth()) {
                            day.class = day.class + " lwc-is-week-end";
                        }
                        break;
                    }
                    case "4/16": {
                        if (date.year() !== moment(date).add(slotEndDateCalc + 1, incrementType).toDate().getFullYear()) {
                            day.class = day.class + " lwc-is-week-end";
                        }
                        break;
                    }
                    default:
                        break;
                }

                dates[index].days.push(day);
                dates[index].style = "width: calc(" + dates[index].days.length + "/" + this.view.slots + "*100%)";
            }

            this.dates = Object.values(dates);

            Array.from(this.template.querySelectorAll("c-pmt-ganttdata")).forEach(resource => {
                resource.refreshDates(this.newStartDate, this.endDate, this.view.slotSize);
            });
        } catch (Exception) {
            this.showToastMessage('Error', 'Error while date headers', 'error');
        }
    }

    navigateToToday() {
        this.isLoading = true;
        if (this.scaleType) {
            const currentYear = new Date().getFullYear();
            this.setStartDate(this.getFirstDayOfYear(currentYear));
        } else {
            this.setStartDate(new Date());
        }
        this.isLoading = false;
    }

    navigateToPrevious() {
        this.isLoading = true;
        let _startDate = this.startDate;
        if (this.scaleType) {
            _startDate = this.getFirstDayOfYear(this.newStartDate.getFullYear() - 1);
        } else {
            this.dateShift = 7;
            _startDate.setDate(_startDate.getDate() - this.dateShift);
        }
        this.setStartDate(_startDate);
    }

    navigateToNext() {
        this.isLoading = true;
        let _startDate = this.startDate;
        if (this.scaleType) {
            _startDate = this.getFirstDayOfYear(this.newStartDate.getFullYear() + 1);
        } else {
            this.dateShift = 7;
            _startDate.setDate(_startDate.getDate() + this.dateShift);
        }
        this.setStartDate(_startDate);
    }

    setView(value) {
        let values = value.split("/");
        this.view.value    = value;
        this.view.slotSize = parseInt(value[0], 10);
        this.view.slots    = parseInt(values[1], 10);
    }

    handlesortByChange(event) {
        this.sortByValue = event.detail.value;
        refreshApex(this.wiredGanttResult).then(() => { this.isLoading = false; });
    }

    handleViewChange(event) {
        this.isLoading = true;
        this.setView(event.target.value);
        this.setDateHeaders();
        if (this.scaleType) {
            this.setStartDate(this.getFirstDayOfYear(new Date().getFullYear()));
        } else {
            this.setStartDate(new Date());
        }
        this.isLoading = false;
        this.startDate = this.newStartDate;
    }

    @wire(fetchGanttData, {
        slotSize:        '$view.slotSize',
        startTime:       '$startDateUTC',
        projectId:       '$projectId',
        projectProgress: '$projectProgress',
        projectHealth:   '$projectHealth',
        systemImpacted:  '$systemImpacted',
        projectSelected: '$projectSelected',
        projectCategory: '$projectCategory',
        program:         '$programSelected',
        sortBy:          '$sortByValue'
    })
    wiredGanttData(result) {
        this.isLoading = true;
        this.wiredGanttResult = result;
        if (result.data) {
            this.dataToShow = [];
            this.processData(result.data);
            this.showProjLMTMessage = (result.data.length === 30);
        } else if (result.error) {
            this.showToastMessage('Error', result.error, 'error');
            this.isLoading = false;
        }
    }

    processData(data) {
        this.dataToShow = [];
        if (data.length !== 0) {
            data.forEach(wrapper => {
                var projectRec = { ...wrapper };
                projectRec.isExpanded  = false;
                projectRec.isDraggable = false;
                projectRec.titleClass  = "slds-media ";
                projectRec.actionIcon  = (projectRec.lstOfChilds) ? 'utility:chevronright' : '';
                this.dataToShow.push(projectRec);
                this.dataBkp = this.dataToShow;
            });
        }
        if (this.filtersCheck) {
            this.getFiltertedData();
            this.filteredView(this.dataToShow);
        }
        if (this.isExpandedCheck) {
            this.showCurrentView(this.dataToShow);
        }
        if (this.expandedData.length !== 0 && this.projectId !== '' && !this.isExpandedCheck && this.dataToShow.length !== 0) {
            if (this.mytaskflag === true) {
                var filtered = [];
                this.dataToShow.forEach(project => {
                    filtered.push(project.id);
                    if (typeof project.lstOfChilds !== 'undefined') {
                        project.lstOfChilds.forEach(phase => {
                            if (this.expandedData.includes(phase.id)) {
                                filtered.push(phase.id);
                            }
                        });
                    }
                });
                filtered.forEach(element => { this.handleshowdataevent(element); });
            } else {
                this.expandedData.forEach(element => { this.handleshowdataevent(element); });
            }
        }
        this.isLoading = false;
    }

    showCurrentView(showData) {
        this.isExpandAll = true;
        var cloneDataToExpand = [...showData];
        cloneDataToExpand = this.expandAll(cloneDataToExpand);
        this.dataToShow = [];
        this.dataToShow = cloneDataToExpand;
        this.isExpandAll = false;
    }

    handleValueChange(event) {
        this.isLoading = true;
        switch (event.target.name) {
            case 'projtgl':
                this.myprojflag   = event.target.checked;
                this.projectCheck = event.target.checked;
                break;
            case 'tasktgl':
                this.mytaskflag = event.target.checked;
                this.taskCheck  = event.target.checked;
                break;
            case 'followtgl':
                this.followprojflag = event.target.checked;
                this.followProject  = event.target.checked;
                break;
        }
        this.filtersCheck = (this.myprojflag === true || this.mytaskflag === true || this.followprojflag === true);
        this.processData(this.wiredGanttResult.data);
        if (!this.filtersCheck) { this.getFiltertedData(); }
    }

    getFiltertedData() {
        try {
            this.isLoading = true;
            var clonedData = [...this.dataToShow];

            if (this.myprojflag === true) {
                clonedData = clonedData.filter(el => el.isMyProject === true);
            }
            if (this.followprojflag === true) {
                this.filtersCheck = true;
                clonedData = clonedData.filter(el => el.isFollow === true);
            }
            if (this.mytaskflag === true) {
                this.filtersCheck = true;
                clonedData = this.filterProjectsWithoutPhases(clonedData);
                var newclonedData = JSON.parse(JSON.stringify(clonedData));

                newclonedData.forEach(element => {
                    element.lstOfChilds.forEach(phase => {
                        if (typeof phase.lstOfChilds !== 'undefined') {
                            phase.lstOfChilds.forEach(task => {
                                if (task.isAssignedToMe === false) {
                                    const index = phase.lstOfChilds.indexOf(task);
                                    phase.lstOfChilds.splice(index, 1, "");
                                }
                            });
                            phase.lstOfChilds = phase.lstOfChilds.filter(Boolean);
                        }
                    });
                });

                var newClone = this.filterPhasesWithoutTasks(newclonedData);
                newClone = this.filterProjectsWithoutPhases(newClone);
                clonedData = newClone;
            }
            this.dataToShow = [];
            this.dataToShow = clonedData;
            this.dataBkp    = this.dataToShow;
            this.isLoading  = false;
        } catch (Exception) {
            this.showToastMessage('Error', 'Error during filtering data', 'error');
        }
    }

    filterProjectsWithoutPhases(data) {
        return data.filter(el => typeof el.lstOfChilds !== 'undefined' && el.lstOfChilds.length !== 0);
    }

    filterPhasesWithoutTasks(data) {
        return data.map(project => ({
            ...project,
            lstOfChilds: project.lstOfChilds.filter(phase =>
                typeof phase.lstOfChilds !== 'undefined' && phase.lstOfChilds.length !== 0
            )
        }));
    }

    filteredView(cloneData) {
        var newclonedData = [];
        cloneData.forEach(element => {
            if (element.objAPIName === 'PMT_Phase__c' || element.objAPIName === 'PMT_Task__c') {
                const index = cloneData.indexOf(element);
                cloneData.splice(index, 1, "");
            }
        });
        newclonedData = cloneData.filter(Boolean);
        return newclonedData;
    }

    handleonclick(event) {
        this.isLoading = true;
        var action = event.target.label;
        switch (action) {
            case '':
                refreshApex(this.wiredGanttResult).then(() => { this.isLoading = false; });
                break;

            case 'Expand All': {
                this.isExpandAll = true;
                var cloneDataToExpand = this.filteredView([...this.dataToShow]);
                cloneDataToExpand = this.expandAll(cloneDataToExpand);
                this.dataToShow  = [];
                this.dataToShow  = cloneDataToExpand;
                this.isExpandAll = false;
                this.isLoading   = false;
                break;
            }
            case 'Collapse All': {
                var cloneDataToCollapse = [...this.dataToShow];
                for (var counter = 0; counter < cloneDataToCollapse.length; counter++) {
                    var index = this.findIndexById(cloneDataToCollapse[counter].id, cloneDataToCollapse);
                    cloneDataToCollapse = this.closeAllChilds(cloneDataToCollapse[index], cloneDataToCollapse);
                }
                this.expandedData.length = 0;
                this.dataToShow  = [];
                this.dataToShow  = cloneDataToCollapse;
                this.isExpandedCheck = false;
                this.isLoading   = false;
                break;
            }
            default:
                break;
        }
    }

    expandAll(cloneData) {
        try {
            this.isExpandedCheck = true;
            for (var counter = 0; counter < cloneData.length; counter++) {
                var record = cloneData[counter];
                var index  = this.findIndexById(record.id, cloneData);
                if (record.objAPIName === 'PMT_Project__c') {
                    cloneData = this.expandView(record, index, cloneData, true);
                }
                var relatedRecords = record.lstOfChilds;
                if (relatedRecords && relatedRecords.length > 0) {
                    relatedRecords.forEach(element => {
                        cloneData = this.expandView(element, index, cloneData, false);
                    });
                }
            }
            return cloneData;
        } catch (Exception) {
            this.showToastMessage('Error', 'Error during expandAll', 'error');
        }
    }

    eventhandler(event) {
        var action = event.detail.type;
        this.expandedData.length = 0;

        switch (action) {
            case 'add':
                this.createAction(event.detail.recordId);
                break;
            case 'refreshData':
                refreshApex(this.wiredGanttResult);
                break;
            case 'showdata':
                this.handleshowdataevent(event.detail.recordId);
                var tempData = JSON.parse(JSON.stringify(this.dataToShow));
                if (this.projectId !== '') {
                    tempData.forEach(element => {
                        if (element.actionIcon === 'utility:chevrondown') {
                            this.expandedData.push(element.id);
                        }
                    });
                }
                break;
        }
    }

    createAction(id) {
        try {
            var defaultValue, newObjectAPI;
            var index  = this.findIndexById(id, this.dataToShow);
            var record = this.dataToShow[index];

            if (record.objAPIName === 'PMT_Project__c') {
                defaultValue = encodeDefaultFieldValues({ Project__c: id });
                newObjectAPI = 'PMT_Phase__c';
            } else if (record.objAPIName === 'PMT_Phase__c') {
                defaultValue = encodeDefaultFieldValues({ Phase__c: id });
                newObjectAPI = 'PMT_Task__c';
            }

            this[NavigationMixin.Navigate]({
                type: 'standard__objectPage',
                attributes: { objectApiName: newObjectAPI, actionName: 'new' },
                state: { defaultFieldValues: defaultValue }
            });
        } catch (Exception) {
            this.showToastMessage('Error', 'Error during record creation', 'error');
        }
    }

    handleshowdataevent(recordId) {
        try {
            var cloneData = [...this.dataToShow];
            const index   = this.findIndexById(recordId, cloneData);
            var record    = cloneData[index];

            const actionIcon = record.actionIcon;
            if (actionIcon) {
                if (record.isExpanded) {
                    cloneData = this.closeAllChilds(record, cloneData);
                } else {
                    record.actionIcon  = 'utility:chevrondown';
                    record.isExpanded  = true;
                    cloneData.splice(index, 1);
                    cloneData.splice(index, 0, record);

                    var relatedRecords = record.lstOfChilds;
                    if (relatedRecords) {
                        relatedRecords.forEach(child => {
                            cloneData = this.expandView(child, index, cloneData, false);
                        });
                    }
                }
            }
            this.dataToShow = cloneData;
            this.isLoading  = false;
        } catch (Exception) {
            this.showToastMessage('Error', 'Error during expand/collapse action', 'error');
        }
    }

    expandView(recordToAdd, index, cloneData, isProject) {
        try {
            var record         = { ...recordToAdd };
            var relatedRecords = record.lstOfChilds;

            record.isExpanded  = (relatedRecords && relatedRecords.length > 0) ? this.isExpandAll : false;
            record.actionIcon  = (relatedRecords && relatedRecords.length > 0)
                ? (this.isExpandAll ? 'utility:chevrondown' : 'utility:chevronright')
                : '';

            var customClass = "slds-media ";
            if (record.objAPIName === 'PMT_Phase__c') {
                customClass      += "slds-p-left_medium";
                record.isDraggable = false;
                record.padding     = "padding-left: 15px;";
            } else if (record.objAPIName === 'PMT_Task__c') {
                customClass      += "slds-p-left_large";
                record.isDraggable = true;
                record.padding     = "padding-left: 30px;";
            }
            record.titleClass = customClass;

            if (isProject) {
                cloneData.splice(index, 1);
                cloneData.splice(index, 0, record);
            } else {
                cloneData.splice(index + 1, 0, record);
            }
            return cloneData;
        } catch (Exception) {
            this.showToastMessage('Error', 'Error during expanding view', 'error');
        }
    }

    closeAllChilds(record, cloneData) {
        try {
            if (record.isExpanded) {
                var relatedRecords = record.lstOfChilds;
                if (relatedRecords && relatedRecords.length > 0) {
                    relatedRecords.forEach(child => {
                        var rec      = { ...child };
                        const recIdx = this.findIndexById(rec.id, cloneData);
                        this.closeAllChilds(cloneData[recIdx], cloneData);
                        cloneData.splice(this.findIndexById(rec.id, cloneData), 1);
                    });
                }
                record.actionIcon = 'utility:chevronright';
                record.isExpanded = false;
                const index = this.findIndexById(record.id, cloneData);
                cloneData.splice(index, 1);
                cloneData.splice(index, 0, record);
            }
            return cloneData;
        } catch (Exception) {
            this.showToastMessage('Error', 'Error while closing childs', 'error');
        }
    }

    findIndexById(Id, listToSearch) {
        try {
            for (var i = 0; i < listToSearch.length; i++) {
                if (listToSearch[i].id === Id) return i;
            }
        } catch (Exception) {
            this.showToastMessage('Error', 'Error during index search', 'error');
        }
    }

    showToastMessage(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}