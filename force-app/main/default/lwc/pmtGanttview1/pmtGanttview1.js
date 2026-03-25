/*
 * Name : pmt_GanttView
 * Description : This is the parent component for PMT Gantt to render filters & child components
 * Version : 57
 */

import { LightningElement, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import fetchGanttFilters from '@salesforce/apex/PMT_GanttCtrl1.getGanttFilters';
const ALL_CONST = 'All';

export default class Pmt_GanttView1 extends LightningElement {
    @api height;        // design attribute — controls wrapper height
    @api withfilters;
    @api recordId;

    // Filter default values
    healthSelected   = ALL_CONST;
    categorySelected = ALL_CONST;
    programSelected  = ALL_CONST;
    systemSelected   = ALL_CONST;
    progressSelected = ALL_CONST;
    projectSelected  = null;

    // Filter options
    healthoptions   = [];
    categoryoptions = [];
    systemoptions   = [];
    progressoptions = [];

    searchProjects = false;
    error;

    // Computed style using height design attribute
    get containerStyle() {
        return this.height
            ? `height: ${this.height}px; overflow: auto;`
            : '';
    }

    connectedCallback() {
        if (typeof this.recordId === 'undefined') {
            this.recordId = '';
        }
    }

    // Wire method to fetch filters
    @wire(fetchGanttFilters)
    getFilters(result) {
        if (result.data) {
            const data = result.data;
            let tempList = [];

            tempList.push({ label: ALL_CONST, value: ALL_CONST });
            data.prjhealth.forEach(health => {
                tempList.push({ label: health.label, value: health.value });
            });
            this.healthoptions = tempList;
            tempList = [];

            tempList.push({ label: ALL_CONST, value: ALL_CONST });
            data.prjcategory.forEach(category => {
                tempList.push({ label: category.label, value: category.value });
            });
            this.categoryoptions = tempList;
            tempList = [];

            tempList.push({ label: ALL_CONST, value: ALL_CONST });
            data.sysimpacted.forEach(system => {
                tempList.push({ label: system.label, value: system.value });
            });
            this.systemoptions = tempList;
            tempList = [];

            tempList.push({ label: ALL_CONST, value: ALL_CONST });
            data.prjprogress.forEach(progress => {
                tempList.push({ label: progress.label, value: progress.value });
            });
            this.progressoptions = tempList;

            this.error = undefined;
        } else if (result.error) {
            this.error = result.error;
            this.showToastMessage('Error', result.error, 'error');
        }
    }

    // Set selected filter values
    handleChange(event) {
        this.searchProjects = false;
        switch (event.target.name) {
            case 'projhealth':
                this.healthSelected = event.detail.value;
                break;
            case 'projcategory':
                this.categorySelected = event.detail.value;
                break;
            case 'sysimpacted':
                this.systemSelected = event.detail.value;
                break;
            case 'projprogress':
                this.progressSelected = event.detail.value;
                break;
            case 'prjname':
                this.projectSelected = event.detail.value;
                break;
        }
    }

    // Trigger child component render
    handleSearch() {
        this.searchProjects = true;
    }

    // Handle program selection
    handleProgramSelection(event) {
        var value = event.detail.value.length > 0 ? event.detail.value[0] : ALL_CONST;
        this.programSelected = value;
        this.searchProjects = false;
    }

    // Show toast
    showToastMessage(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({ title, message, variant })
        );
    }
}