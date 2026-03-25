/******************************************************************************************************
* Name: PMT_GanttCtrl.apxc
* Test class : PMT_GanttCtrlTest (87%)
* Used by: Used by LWC pmtGantt.cmp & pmtGanttdata.cmp
* Description : Class to get required filters and the data for PMT Gantt LWC components
* Version     : 57 - Added Actual Start Date & Actual End Date support
******************************************************************************************************/

public with sharing class PMT_GanttCtrl1 {
    
    /*******************************************************************************************************************
* Method Name: fetchGanttData
* Description: Queries data as per filters provided to show on gantt chart
* Parameter  : Filters selected by user + projectId if chart is on a specific project record page
* Returns    : List<GanttDataWrapper>
*******************************************************************************************************************/
    @AuraEnabled(cacheable = true)
    public static List<GanttDataWrapper> fetchGanttData(
        Integer slotSize,
        Date startTime,
        String projectId,
        String projectProgress,
        String projectHealth,
        String systemImpacted,
        String projectSelected,
        String projectCategory,
        String program,
        String sortBy
    ) {
        List<Id>                        projIds                  = new List<Id>();
        Id                              loginUserId              = UserInfo.getUserId();
        Set<Id>                         setOfProjOwners          = new Set<Id>();
        Set<Id>                         followIds                = new Set<Id>();
        Set<Id>                         setOfTasksAssignedToMe   = new Set<Id>();
        List<GanttDataWrapper>          lstOfWrapper             = new List<GanttDataWrapper>();
        Map<Id, List<PMT_Phase__c>>     mapOfMilestoneToPhases   = new Map<Id, List<PMT_Phase__c>>();
        Map<Id, List<PMT_Task__c>>      mapOfPhaseToTasks        = new Map<Id, List<PMT_Task__c>>();
        
        List<String> lstOfProjectFields = new List<String>{
            'Id', 'OwnerId', 'Name', 'Kickoff_formula__c', 'Duration__c',
                'Deadline_formula__c', 'Project_Status__c', 'Project_Health__c',
                'Health_Icon__c', 'Project_Category__c', 'Program_Text__c', 'SystemsImpacted__c'
                };
                    
                    slotSize = Integer.valueOf(slotSize);
        Date startDate = startTime;
        
        if (!PMT_Utility.validateCRUD('PMT_Project__c', lstOfProjectFields, 'isAccessible')) {
            throw new AuraHandledException('You don\'t have access to PMT Project. Please contact system administrator.');
        }
        
        List<PMT_Project__c> projects = getProjects(
            projectId, projectProgress, projectHealth,
            systemImpacted, projectSelected, projectCategory, program
        );
        
        if (projects == null || projects.isEmpty()) {
            return lstOfWrapper;
        }
        
        // Cap at 1000
        List<PMT_Project__c> projects_clone = projects.clone();
        projects.clear();
        Integer size = (projects_clone.size() > 1000) ? 1000 : projects_clone.size();
        for (Integer i = 0; i < size; i++) {
            PMT_Project__c prj = projects_clone[i];
            projects.add(prj);
            projIds.add(prj.Id);
            setOfProjOwners.add(prj.OwnerId);
        }
        
        // Follow IDs
        List<String> lstOfEntitySubscrFields = new List<String>{ 'Id', 'ParentId', 'SubscriberId' };
            if (PMT_Utility.validateCRUD('EntitySubscription', lstOfEntitySubscrFields, 'isAccessible')) {
                followIds = getFollowIds(projects);
            } else {
                throw new AuraHandledException('Access restricted to check following project, please contact system administrator.');
            }
        
        // Phases
        List<String> lstOfPhaseFields = new List<String>{
            'Id', 'Name', 'Kickoff_formula__c', 'Duration__c',
                'Deadline_formula__c', 'Health_Icon__c', 'Phase_Health__c', 'Project__c'
                };
                    
                    if (!PMT_Utility.validateCRUD('PMT_Phase__c', lstOfPhaseFields, 'isAccessible')) {
                        throw new AuraHandledException('You don\'t have access to PMT Phases or tasks. Please contact system administrator.');
                    }
        
        Map<Id, PMT_Phase__c> mapOfPhases = getPhases(projIds, sortBy);
        
        // Tasks — includes Actual_Start_Date__c & Actual_End_Date__c
        List<String> lstOfTaskFields = new List<String>{
            'Name', 'Start_Date__c', 'Due_Date__c', 'Duration__c',
                'Percentage_Completion__c', 'Assigned_To1__c', 'Status__c',
                'Phase__c', 'Is_Milestone__c',
                'Actual_Start_Date__c', 'Actual_End_Date__c'   // ← NEW
                };
                    
                    if (!PMT_Utility.validateCRUD('PMT_Task__c', lstOfTaskFields, 'isAccessible')) {
                        throw new AuraHandledException('You don\'t have access to PMT task. Please contact system administrator.');
                    }
        
        Map<Id, PMT_Task__c> mapOfTasks = getTasks(mapOfPhases.keySet(), sortBy);
        
        for (PMT_Task__c tsk : mapOfTasks.values()) {
            if (tsk.Assigned_To1__c == loginUserId) {
                setOfTasksAssignedToMe.add(tsk.Id);
                setOfTasksAssignedToMe.add(tsk.Phase__r.Id);
                setOfTasksAssignedToMe.add(tsk.Phase__r.Project__r.Id);
            }
            
            if (mapOfPhaseToTasks.containsKey(tsk.Phase__c)) {
                mapOfPhaseToTasks.get(tsk.Phase__c).add(tsk);
            } else {
                mapOfPhaseToTasks.put(tsk.Phase__c, new List<PMT_Task__c>{ tsk });
            }
        }
        
        // Build phase map
        for (PMT_Phase__c phs : mapOfPhases.values()) {
            if (mapOfMilestoneToPhases.containsKey(phs.Project__c)) {
                mapOfMilestoneToPhases.get(phs.Project__c).add(phs);
            } else {
                mapOfMilestoneToPhases.put(phs.Project__c, new List<PMT_Phase__c>{ phs });
            }
        }
        
        // Build wrapper list
        for (PMT_Project__c prj : projects) {
            
            // Project wrapper — no actual dates at project level
            GanttDataWrapper pmtProject = getGanttDataWrapper(
                slotSize, startDate,
                prj.Id, prj.Name,
                prj.Kickoff_formula__c, prj.Deadline_formula__c, prj.Duration__c,
                '', 'PMT_Project__c',
                prj.Health_Icon__c, prj.Project_Health__c,
                followIds.contains(prj.Id),
                setOfTasksAssignedToMe.contains(prj.Id),
                (prj.OwnerId == loginUserId),
                formatDate(prj.Deadline_formula__c, 'dd-MM-yyyy'),
                false,
                null, null   // ← actual dates: not applicable at project level
            );
            
            if (mapOfMilestoneToPhases.containsKey(prj.Id)) {
                List<GanttDataWrapper> lstOfPhases = new List<GanttDataWrapper>();
                
                for (PMT_Phase__c phs : mapOfMilestoneToPhases.get(prj.Id)) {
                    
                    // Phase wrapper — no actual dates at phase level
                    GanttDataWrapper pmtPhase = getGanttDataWrapper(
                        slotSize, startDate,
                        phs.Id, phs.Name,
                        phs.Kickoff_formula__c, phs.Deadline_formula__c, phs.Duration__c,
                        phs.Project__c, 'PMT_Phase__c',
                        phs.Health_Icon__c, phs.Phase_Health__c,
                        followIds.contains(phs.Project__r.Id),
                        setOfTasksAssignedToMe.contains(phs.Id),
                        setOfProjOwners.contains(loginUserId),
                        null,
                        false,
                        null, null   // ← actual dates: not applicable at phase level
                    );
                    
                    if (mapOfPhaseToTasks.containsKey(phs.Id)) {
                        List<GanttDataWrapper> lstOfTasks = new List<GanttDataWrapper>();
                        
                        for (PMT_Task__c tsk : mapOfPhaseToTasks.get(phs.Id)) {
                            
                            // Task wrapper — actual dates passed from queried fields
                            GanttDataWrapper pmtTask = getGanttDataWrapper(
                                slotSize, startDate,
                                tsk.Id, tsk.Name,
                                tsk.Start_Date__c, tsk.Due_Date__c, tsk.Duration__c,
                                tsk.Phase__c, 'PMT_Task__c',
                                tsk.Status_Icon__c, tsk.Status__c,
                                followIds.contains(tsk.Phase__r.Project__r.Id),
                                setOfTasksAssignedToMe.contains(tsk.Id),
                                setOfProjOwners.contains(loginUserId),
                                null,
                                tsk.Is_Milestone__c,
                                tsk.Actual_Start_Date__c, tsk.Actual_End_Date__c   // ← NEW
                            );
                            pmtTask.lstOfChilds = new List<GanttDataWrapper>();
                            lstOfTasks.add(pmtTask);
                        }
                        pmtPhase.lstOfChilds = lstOfTasks;
                    }
                    lstOfPhases.add(pmtPhase);
                }
                pmtProject.lstOfChilds = lstOfPhases;
            }
            lstOfWrapper.add(pmtProject);
        }
        
        return lstOfWrapper;
    }
    
    /********************************************************************************
* Class: GanttDataWrapper
* Description: Wrapper used to pass data to the Gantt LWC
********************************************************************************/
    public class GanttDataWrapper {
        
        @AuraEnabled public Id      id              { get; set; }
        @AuraEnabled public String  text            { get; set; }
        @AuraEnabled public Date    start_date      { get; set; }
        @AuraEnabled public Date    end_date        { get; set; }
        @AuraEnabled public String  parent          { get; set; }
        @AuraEnabled public Decimal duration        { get; set; }
        @AuraEnabled public String  objAPIName      { get; set; }
        @AuraEnabled public String  statusIcon      { get; set; }
        @AuraEnabled public String  status          { get; set; }
        @AuraEnabled public Boolean isFollow        { get; set; }
        @AuraEnabled public Boolean isAssignedToMe  { get; set; }
        @AuraEnabled public Boolean isMyProject     { get; set; }
        @AuraEnabled public String  deadline        { get; set; }
        @AuraEnabled public Boolean isMilestone     { get; set; }
        @AuraEnabled public Decimal left            { get; set; }
        @AuraEnabled public Decimal right           { get; set; }
        
        // ── Actual date fields ──────────────────────────────────────
        @AuraEnabled public Date    actual_start_date { get; set; }   // ← NEW
        @AuraEnabled public Date    actual_end_date   { get; set; }   // ← NEW
        @AuraEnabled public Decimal actual_left       { get; set; }   // ← NEW
        @AuraEnabled public Decimal actual_right      { get; set; }   // ← NEW
        // ────────────────────────────────────────────────────────────
        
        @AuraEnabled public List<GanttDataWrapper> lstOfChilds { get; set; }
    }
    
    /*************************************************************************************
* Method Name: getGanttDataWrapper
* Description: Builds a GanttDataWrapper and calculates left/right slot offsets
*              for both planned and actual date bars.
* NEW params  : actualStartDate, actualEndDate
* Returns     : GanttDataWrapper
*************************************************************************************/
    public static GanttDataWrapper getGanttDataWrapper(
        Integer slotSize,
        Date    sDate,
        Id      recId,
        String  name,
        Date    startDate,
        Date    endDate,
        Decimal duration,
        String  parentId,
        String  objAPIName,
        String  statusIcon,
        String  status,
        Boolean isFollow,
        Boolean isAssignedToMe,
        Boolean isMyProject,
        String  prjDeadline,
        Boolean isMilestone,
        Date    actualStartDate,   // ← NEW
        Date    actualEndDate      // ← NEW
    ) {
        try {
            GanttDataWrapper rec      = new GanttDataWrapper();
            rec.id                    = recId;
            rec.text                  = name;
            rec.start_date            = startDate;
            rec.end_date              = endDate;
            rec.duration              = duration;
            rec.parent                = parentId;
            rec.objAPIName            = objAPIName;
            rec.statusIcon            = statusIcon;
            rec.status                = status;
            rec.isFollow              = isFollow;
            rec.isAssignedToMe        = isAssignedToMe;
            rec.isMyProject           = isMyProject;
            rec.deadline              = prjDeadline;
            rec.isMilestone           = isMilestone;
            rec.actual_start_date     = actualStartDate;   // ← NEW
            rec.actual_end_date       = actualEndDate;     // ← NEW
            
            Decimal leftW    = slotSize;
            Decimal rightW   = slotSize;
            Decimal leftQtrs = 0;
            Decimal rightQtrs = 0;
            
            // ── Quarterly / Monthly slot calculation (slotSize 92 or 31) ──
            if (slotSize == 92 || slotSize == 31) {
                Date tempStart = sDate;
                sDate = sDate.addDays(1);
                
                if (slotSize == 92) {
                    if (tempStart.addMonths(3) <= endDate) {
                        for (Date tDate = tempStart.addMonths(3); tDate <= endDate; tDate = tDate.addMonths(3)) {
                            Date lastOfMonth = Date.newInstance(tDate.year(), tDate.month(), Date.daysInMonth(tDate.year(), tDate.month()));
                            if (lastOfMonth < startDate) { leftQtrs++;  }
                            if (lastOfMonth < endDate)   { rightQtrs++; }
                        }
                    } else {
                        for (Date tDate = endDate; tempStart.addMonths(3) >= tDate; tDate = tDate.addMonths(3)) {
                            Date lastOfMonth = Date.newInstance(tDate.year(), tDate.month(), Date.daysInMonth(tDate.year(), tDate.month()));
                            if (lastOfMonth > startDate) { leftQtrs--;  }
                            if (lastOfMonth > endDate)   { rightQtrs--; }
                        }
                    }
                }
                
                if (slotSize == 31) {
                    if (tempStart.addDays(1) <= endDate) {
                        for (Date tDate = tempStart.addDays(1); tDate <= endDate; ) {
                            Date checkDate = tDate.addDays(Date.daysInMonth(tDate.year(), tDate.month()));
                            if (Date.newInstance(checkDate.year(), checkDate.month(), checkDate.day()) <= startDate) { leftQtrs++;  }
                            if (Date.newInstance(checkDate.year(), checkDate.month(), checkDate.day()) <= endDate)   { rightQtrs++; }
                            tDate = tDate.addDays(Date.daysInMonth(tDate.year(), tDate.month()));
                        }
                    } else {
                        for (Date tDate = endDate; tempStart.addDays(1) >= tDate; ) {
                            Date checkDate = tDate.addDays(Date.daysInMonth(tDate.year(), tDate.month()));
                            if (Date.newInstance(checkDate.year(), checkDate.month(), checkDate.day()) >= startDate) { leftQtrs--;  }
                            if (Date.newInstance(checkDate.year(), checkDate.month(), checkDate.day()) >= endDate)   { rightQtrs--; }
                            tDate = tDate.addDays(Date.daysInMonth(tDate.year(), tDate.month()));
                        }
                    }
                }
            }
            
            // ── Assign planned left / right ──
            if (slotSize != null) {
                if (slotSize == 31 || slotSize == 92) {
                    rec.left  = leftQtrs;
                    rec.right = rightQtrs;
                } else {
                    if (startDate != null) {
                        Decimal lv = Decimal.valueOf(sDate.daysBetween(startDate)) / leftW;
                        rec.left = lv.round(System.RoundingMode.FLOOR);
                    }
                    if (endDate != null) {
                        Decimal rv = Decimal.valueOf(sDate.daysBetween(endDate)) / rightW;
                        rec.right = rv.round(System.RoundingMode.FLOOR);
                    }
                }
            }
            
            // ── Assign actual left / right (same slot logic, uses actual dates) ──
            if (slotSize != null && actualStartDate != null) {
                
                if (slotSize == 31 || slotSize == 92) {
                    Decimal aLeftQtrs  = 0;
                    Decimal aRightQtrs = 0;
                    
                    if (slotSize == 92) {
                        if (sDate.addMonths(3) <= (actualEndDate != null ? actualEndDate : actualStartDate)) {
                            for (Date tDate = sDate.addMonths(3); tDate <= (actualEndDate != null ? actualEndDate : actualStartDate); tDate = tDate.addMonths(3)) {
                                Date lastOfMonth = Date.newInstance(tDate.year(), tDate.month(), Date.daysInMonth(tDate.year(), tDate.month()));
                                if (lastOfMonth < actualStartDate)                                { aLeftQtrs++;  }
                                if (actualEndDate != null && lastOfMonth < actualEndDate)         { aRightQtrs++; }
                            }
                        } else {
                            for (Date tDate = (actualEndDate != null ? actualEndDate : actualStartDate); sDate.addMonths(3) >= tDate; tDate = tDate.addMonths(3)) {
                                Date lastOfMonth = Date.newInstance(tDate.year(), tDate.month(), Date.daysInMonth(tDate.year(), tDate.month()));
                                if (lastOfMonth > actualStartDate)                                { aLeftQtrs--;  }
                                if (actualEndDate != null && lastOfMonth > actualEndDate)         { aRightQtrs--; }
                            }
                        }
                    }
                    
                    if (slotSize == 31) {
                        Date aEnd = actualEndDate != null ? actualEndDate : actualStartDate;
                        if (sDate.addDays(1) <= aEnd) {
                            for (Date tDate = sDate.addDays(1); tDate <= aEnd; ) {
                                Date checkDate = tDate.addDays(Date.daysInMonth(tDate.year(), tDate.month()));
                                if (Date.newInstance(checkDate.year(), checkDate.month(), checkDate.day()) <= actualStartDate) { aLeftQtrs++;  }
                                if (Date.newInstance(checkDate.year(), checkDate.month(), checkDate.day()) <= aEnd)            { aRightQtrs++; }
                                tDate = tDate.addDays(Date.daysInMonth(tDate.year(), tDate.month()));
                            }
                        } else {
                            for (Date tDate = aEnd; sDate.addDays(1) >= tDate; ) {
                                Date checkDate = tDate.addDays(Date.daysInMonth(tDate.year(), tDate.month()));
                                if (Date.newInstance(checkDate.year(), checkDate.month(), checkDate.day()) >= actualStartDate) { aLeftQtrs--;  }
                                if (Date.newInstance(checkDate.year(), checkDate.month(), checkDate.day()) >= aEnd)            { aRightQtrs--; }
                                tDate = tDate.addDays(Date.daysInMonth(tDate.year(), tDate.month()));
                            }
                        }
                    }
                    
                    rec.actual_left  = aLeftQtrs;
                    rec.actual_right = aRightQtrs;
                    
                } else {
                    // Day/Week/Month view: simple day-based offset
                    Decimal aLV = Decimal.valueOf(sDate.daysBetween(actualStartDate)) / leftW;
                    rec.actual_left = aLV.round(System.RoundingMode.FLOOR);
                    
                    if (actualEndDate != null) {
                        Decimal aRV = Decimal.valueOf(sDate.daysBetween(actualEndDate)) / rightW;
                        rec.actual_right = aRV.round(System.RoundingMode.FLOOR);
                    }
                }
            }
            return rec;
            
        } catch (Exception e) {
            List<String> lstOfLogFields = new List<String>{ 'Apex_Class__c', 'Error_Message__c', 'Method_Name__c' };
                if (PMT_Utility.validateCRUD('PMT_Error_Log__c', lstOfLogFields, 'isCreatable')) {
                    INSERT new PMT_Error_Log__c(
                        Apex_Class__c   = 'PMT_GanttCtrl',
                        Error_Message__c = e.getMessage(),
                        Method_Name__c  = 'getGanttDataWrapper'
                    );
                }
            return new GanttDataWrapper();
        }
    }
    
    /**********************************************************************
* Method Name: formatDate
* Description: Formats a Date to a given pattern string
* Returns    : String
**********************************************************************/
    private static String formatDate(Date d, String format) {
        if (d == null) { return null; }
        Datetime dt = Datetime.newInstance(d.year(), d.month(), d.day());
        return dt.format(format);
    }
    
    /************************************************************************************
* Method Name: getProjects
* Description: Queries PMT_Project__c with dynamic filters
* Returns    : List<PMT_Project__c>
************************************************************************************/
    private static List<PMT_Project__c> getProjects(
        String projectId,
        String projectProgress,
        String projectHealth,
        String systemImpacted,
        String projectName,
        String projectCategory,
        String program
    ) {
        String selectStr =
            'SELECT Id, OwnerId, Name, Kickoff_formula__c, Duration__c, Deadline_formula__c, ' +
            'Project_Status__c, Project_Health__c, Health_Icon__c, Project_Category__c, ' +
            'Program_Text__c, SystemsImpacted__c ';
        
        String fromStr  = 'FROM PMT_Project__c';
        Boolean isWhere = false;
        String whereStr = ' WHERE isTemplate__c = false';
        
        if (String.isNotBlank(projectId)) {
            isWhere  = true;
            whereStr += ' AND Id = \'' + String.escapeSingleQuotes(projectId) + '\'';
        }
        if (String.isNotBlank(projectProgress) && projectProgress != 'All') {
            whereStr += ' AND Project_Status__c = \'' + String.escapeSingleQuotes(projectProgress) + '\'';
        }
        if (String.isNotBlank(projectHealth) && projectHealth != 'All') {
            whereStr += ' AND Project_Health__c = \'' + String.escapeSingleQuotes(projectHealth) + '\'';
        }
        if (String.isNotBlank(systemImpacted) && !systemImpacted.contains('All')) {
            whereStr += ' AND SystemsImpacted__c includes (\'' + String.escapeSingleQuotes(systemImpacted) + '\')';
        }
        if (String.isNotBlank(projectName)) {
            if (isWhere) {
                whereStr += ' AND Name LIKE \'%' + projectName + '%\'';
            } else {
                isWhere  = true;
                whereStr = ' WHERE Name LIKE \'%' + projectName + '%\'';
            }
        }
        if (String.isNotBlank(projectCategory) && projectCategory != 'All') {
            whereStr += ' AND Project_Category__c = \'' + String.escapeSingleQuotes(projectCategory) + '\'';
        }
        if (String.isNotBlank(program) && program != 'All') {
            whereStr += ' AND Program__c = \'' + String.escapeSingleQuotes(program) + '\'';
        }
        
        String orderByStr = ' ORDER BY Name, Kickoff_formula__c, Deadline_formula__c ASC LIMIT 30';
        return Database.query(selectStr + ' ' + fromStr + whereStr + orderByStr);
    }
    
    /*****************************************************************************************************************
* Method Name: getPhases
* Description: Queries PMT_Phase__c records for the given project IDs
* Returns    : Map<Id, PMT_Phase__c>
*****************************************************************************************************************/
    private static Map<Id, PMT_Phase__c> getPhases(List<Id> lstOfProjIds, String sortBy) {
        Map<Id, PMT_Phase__c> mapOfPhases = new Map<Id, PMT_Phase__c>();
        
        switch on sortBy {
            when 'Start_Date__c Asc'  { sortBy = 'Start_Date_Rollup__c Asc';  }
            when 'Start_Date__c Desc' { sortBy = 'Start_Date_Rollup__c Desc'; }
            when 'Due_Date__c Asc'    { sortBy = 'End_Date_Rollup__c Asc';    }
            when 'Due_Date__c Desc'   { sortBy = 'End_Date_Rollup__c Desc';   }
        }
        
        String query =
            'SELECT Id, Name, Kickoff_formula__c, Duration__c, Project__c, ' +
            'Deadline_formula__c, Health_Icon__c, Phase_Health__c, Project__r.Id ' +
            'FROM PMT_Phase__c WHERE Project__c IN :lstOfProjIds ' +
            'ORDER BY ' + sortBy + ', Name ASC';
        
        for (PMT_Phase__c phaseRec : Database.query(query)) {
            mapOfPhases.put(phaseRec.Id, phaseRec);
        }
        return mapOfPhases;
    }
    
    /*********************************************************************************************************
* Method Name: getTasks
* Description: Queries PMT_Task__c records for the given phase IDs
*              NOW includes Actual_Start_Date__c and Actual_End_Date__c
* Returns    : Map<Id, PMT_Task__c>
*********************************************************************************************************/
    private static Map<Id, PMT_Task__c> getTasks(Set<Id> setOfPhaseIds, String sortBy) {
        Map<Id, PMT_Task__c> mapOfTasks = new Map<Id, PMT_Task__c>();
        
        String query =
            'SELECT Id, Name, Start_Date__c, Duration__c, Phase__c, Due_Date__c, ' +
            'Status_Icon__c, Status__c, Phase__r.Project__r.Id, Assigned_To1__c, ' +
            'Phase__r.Id, Is_Milestone__c, ' +
            'Actual_Start_Date__c, Actual_End_Date__c ' +   // ← NEW
            'FROM PMT_Task__c WHERE Phase__c IN :setOfPhaseIds ' +
            'ORDER BY ' + sortBy + ', Name ASC';
        
        for (PMT_Task__c taskRec : Database.query(query)) {
            mapOfTasks.put(taskRec.Id, taskRec);
        }
        return mapOfTasks;
    }
    
    /**********************************************************************
* Method Name: getFollowIds
* Description: Returns set of project IDs the current user follows
* Returns    : Set<Id>
**********************************************************************/
    private static Set<Id> getFollowIds(List<PMT_Project__c> projects) {
        Set<Id> proIds = new Set<Id>();
        for (PMT_Project__c p : projects) { proIds.add(p.Id); }
        
        Set<Id> followProjectId = new Set<Id>();
        List<EntitySubscription> eList = [
            SELECT Id, ParentId, SubscriberId
            FROM EntitySubscription
            WHERE ParentId IN :proIds
            AND SubscriberId = :UserInfo.getUserId()
            LIMIT 1000
        ];
        for (EntitySubscription e : eList) { followProjectId.add(e.ParentId); }
        return followProjectId;
    }
    
    /**********************************************************************
* Class: GanttFliterWrapper
* Description: Wrapper for gantt filter picklist values
**********************************************************************/
    public class GanttFliterWrapper {
        @AuraEnabled public List<Filter> prjhealth;    // Project Health values
        @AuraEnabled public List<Filter> prjcategory;  // Project Category values
        @AuraEnabled public List<Filter> sysimpacted;  // Systems Impacted values
        @AuraEnabled public List<Filter> prjprogress;  // Project Status values
    }
    
    /**********************************************************************
* Class: Filter
* Description: Stores label/value pairs for picklist options
**********************************************************************/
    public class Filter {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        
        public Filter(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }
    
    /******************************************************************************************************
* Method Name: getGanttFilters
* Description: Returns picklist filter options for the Gantt header
* Returns    : GanttFliterWrapper
******************************************************************************************************/
    @AuraEnabled(cacheable = true)
    public static GanttFliterWrapper getGanttFilters() {
        try {
            List<String> lstOfProjectFields = new List<String>{
                'Project_Health__c', 'Project_Category__c', 'SystemsImpacted__c', 'Project_Status__c'
                    };
                        
                        if (!PMT_Utility.validateCRUD('PMT_Project__c', lstOfProjectFields, 'isAccessible')) {
                            throw new AuraHandledException('You don\'t have access to PMT Project filters. Please contact system administrator.');
                        }
            
            List<Filter> prjhealth   = new List<Filter>();
            List<Filter> prjcategory = new List<Filter>();
            List<Filter> sysimpacted = new List<Filter>();
            List<Filter> prjprogress = new List<Filter>();
            
            for (String key : PMT_Utility.getPicklistValues('PMT_Project__c', 'Project_Health__c').keySet()) {
                prjhealth.add(new Filter(key, PMT_Utility.getPicklistValues('PMT_Project__c', 'Project_Health__c').get(key)));
            }
            for (String key : PMT_Utility.getPicklistValues('PMT_Project__c', 'Project_Category__c').keySet()) {
                prjcategory.add(new Filter(key, PMT_Utility.getPicklistValues('PMT_Project__c', 'Project_Category__c').get(key)));
            }
            for (String key : PMT_Utility.getPicklistValues('PMT_Project__c', 'SystemsImpacted__c').keySet()) {
                sysimpacted.add(new Filter(key, PMT_Utility.getPicklistValues('PMT_Project__c', 'SystemsImpacted__c').get(key)));
            }
            for (String key : PMT_Utility.getPicklistValues('PMT_Project__c', 'Project_Status__c').keySet()) {
                prjprogress.add(new Filter(key, PMT_Utility.getPicklistValues('PMT_Project__c', 'Project_Status__c').get(key)));
            }
            
            GanttFliterWrapper filter = new GanttFliterWrapper();
            filter.prjhealth   = prjhealth;
            filter.prjcategory = prjcategory;
            filter.sysimpacted = sysimpacted;
            filter.prjprogress = prjprogress;
            return filter;
            
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    /************************************************************************************************
* Method Name: saveTask
* Description: Updates PMT_Task__c planned start/end dates from drag on Gantt chart
* Returns    : String success message
************************************************************************************************/
    @AuraEnabled(cacheable = false)
    public static String saveTask(String taskId, Date startDate, Date endDate) {
        try {
            List<String> lstOfTasksFields = new List<String>{ 'Id', 'Start_Date__c', 'Due_Date__c' };
                Id taskRecId = Id.valueOf(taskId);
            
            if (!PMT_Utility.validateCRUD('PMT_Task__c', lstOfTasksFields, 'isAccessible')) {
                throw new AuraHandledException('You don\'t have access to PMT task. Please contact system administrator.');
            }
            if (!PMT_Utility.validateCRUD('PMT_Task__c', null, 'isUpdateable')) {
                throw new AuraHandledException('You don\'t have access to update PMT Task. Please contact system administrator.');
            }
            
            PMT_Task__c task = new PMT_Task__c(
                Id            = taskRecId,
                Start_Date__c = startDate,
                Due_Date__c   = endDate
            );
            update task;
            return 'Task updated successfully.';
            
        } catch (Exception e) {
            List<String> lstOfLogFields = new List<String>{ 'Apex_Class__c', 'Error_Message__c', 'Method_Name__c' };
                if (PMT_Utility.validateCRUD('PMT_Error_Log__c', lstOfLogFields, 'isCreatable')) {
                    INSERT new PMT_Error_Log__c(
                        Apex_Class__c    = 'PMT_GanttCtrl',
                        Error_Message__c = e.getMessage(),
                        Method_Name__c   = 'saveTask'
                    );
                }
            throw new AuraHandledException(e.getMessage());
        }
    }
}