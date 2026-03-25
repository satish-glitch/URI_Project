public with sharing class PMTGanttActualController {

    /**
     * Fetch all PMT Tasks for a given Project
     * Object  : PMT_Task__c
     * Fields used:
     *   - Start_Date__c               → Planned Start Date (drives blue Gantt bar)
     *   - Due_Date__c                 → Planned End Date   (drives blue Gantt bar)
     *   - Actual_Start_Date__c        → Custom field we added (drives amber Actual bar)
     *   - Actual_End_Date__c          → Custom field we added (drives amber Actual bar)
     *   - Phase__c                    → Parent Phase lookup
     *   - Project_Id__c               → Parent Project lookup
     *   - Status__c                   → Task status picklist
     *   - Percentage_Completion__c    → % complete roll-up
     *   - Assigned_To1__c             → Resource assigned
     */
    @AuraEnabled(cacheable=true)
    public static List<PMT_Task__c> fetchTasks(String projectId) {
        return [
            SELECT
                Id,
                Name,
                Start_Date__c,
                Due_Date__c,
                Actual_Start_Date__c,
                Actual_End_Date__c,
                Phase__c,
                Phase__r.Name,
                Status__c,
                Percentage_Completion__c,
                Assigned_To1__c
            FROM PMT_Task__c
            WHERE Project_Id__c = :projectId
            ORDER BY Start_Date__c ASC NULLS LAST
            LIMIT 500
        ];
    }

    /**
     * Save Actual Start & End dates back to the task
     * Called when user fills in actual dates in the LWC modal
     */
    @AuraEnabled
    public static void saveActualDates(
        String taskId,
        Date actualStartDate,
        Date actualEndDate
    ) {
        try {
            PMT_Task__c task = new PMT_Task__c(
                Id                  = taskId,
                Actual_Start_Date__c = actualStartDate,
                Actual_End_Date__c   = actualEndDate
            );
            update task;
        } catch (Exception e) {
            throw new AuraHandledException('Error saving actual dates: ' + e.getMessage());
        }
    }

    /**
     * Fetch project details for header display
     */
    @AuraEnabled(cacheable=true)
    public static PMT_Project__c fetchProject(String projectId) {
        return [
            SELECT
                Id,
                Name,
                Initial_Start_Date__c,
                Initial_End_Date__c,
                Project_Health__c,
                Project_Status__c
            FROM PMT_Project__c
            WHERE Id = :projectId
            LIMIT 1
        ];
    }
}