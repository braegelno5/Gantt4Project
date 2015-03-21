
var ge;  //this is the hugly but very friendly global var for the gantt editor

$(document).ready(function () {
    SP.SOD.executeFunc('sp.js', 'SP.ClientContext', initAppGantt);
});

function initAppGantt() {

    if(spPageInEditMode()){
        return;
    }
  
    //load templates
    $("#ganttemplates").loadTemplates();

    // here starts gantt initialization
    ge = new GanttMaster();
    var ganttWorkSpace = $("#ganttWorkSpace");
    ganttWorkSpace.css({width:$(window).width() - 250,height:$(window).height() - 250});
    ge.init(ganttWorkSpace);

    //inject some buttons (for this demo only)
    $(".ganttButtonBar div").append("<button type='button' onclick='saveGanttOnServer(); return false;' class='button first big' title='save'>save</button>");
    $(".ganttButtonBar div").append("<button type='button' onclick='clearGantt(); return false;' class='button'>clear</button>");
    $(".ganttButtonBar h1").html("New Project");
    $(".ganttButtonBar div").addClass('buttons');
    //overwrite with localized ones
    loadI18n();

    //load data from a server.
    loadSpTasksWithAllFieldsFromServer();


    //fill default Teamwork roles if any
    if (!ge.roles || ge.roles.length == 0) {
        setRoles();
    }

    //fill default Resources roles if any
    if (!ge.resources || ge.resources.length == 0) {
        setResource();
    }

    $(window).resize(function () {
        ganttWorkSpace.css({width:$(window).width() - 250,height:$(window).height() - 250});
        ganttWorkSpace.trigger("resize.gantt");
    });
}

function saveGanttOnServer() {
    if(!ge.canWrite)
        return;

    saveGanttOnSpList();
    /*
    //this is a simulation: save data to the local storage or to the textarea
    saveInLocalStorage();

    var prj = ge.saveProject();
  
    delete prj.resources;
    delete prj.roles;
  
    var prof = new Profiler("saveServerSide");
    prof.reset();
  
    if (ge.deletedTaskIds.length>0) {
      if (!confirm("TASK_THAT_WILL_BE_REMOVED\n"+ge.deletedTaskIds.length)) {
        return;
      }
    }
  
    $.ajax("ganttAjaxController.jsp", {
      dataType:"json",
      data: {CM:"SVPROJECT",prj:JSON.stringify(prj)},
      type:"POST",
  
      success: function(response) {
        if (response.ok) {
          prof.stop();
          if (response.project) {
            ge.loadProject(response.project); //must reload as "tmp_" ids are now the good ones
          } else {
            ge.reset();
          }
        } else {
          var errMsg="Errors saving project\n";
          if (response.message) {
            errMsg=errMsg+response.message+"\n";
          }
  
          if (response.errorMessages.length) {
            errMsg += response.errorMessages.join("\n");
          }
  
          alert(errMsg);
        }
      }
  
    });
    */
}

//-------------------------------------------  SharePoint specigic handling -----------------------------------------------
function spPageInEditMode() {
    var inEditMode = null;
    if (document.forms[window.MSOWebPartPageFormName].MSOLayout_InDesignMode) {
        inEditMode = document.forms[window.MSOWebPartPageFormName].MSOLayout_InDesignMode.value;
    }
    var wikiInEditMode = null;
    if (document.forms[window.MSOWebPartPageFormName]._wikiPageMode) {
        wikiInEditMode = document.forms[window.MSOWebPartPageFormName]._wikiPageMode.value;
    }
    if (!inEditMode && !wikiInEditMode)
        return false;
    return inEditMode === "1" || wikiInEditMode === "Edit";
}



function onQueryFailed(sender, args) {

    alert('Request failed. ' + args.get_message() +
        '\n\n' + args.get_stackTrace());

    loadFromLocalStorage();
}

function loadSpTasksWithAllFieldsFromServer() {

    var listName = 'Tasks';
    if (typeof window.ganttTaskListName !== 'undefined') {
        listName = window.ganttTaskListName;
    }

    $(".ganttButtonBar h1").html(listName);

    var ctx = new SP.ClientContext.get_current();

    ctx.add_requestFailed(onQueryFailed);

    var fields = ctx.loadQuery(
        ctx
        .get_web()
        .get_lists()
        .getByTitle(listName)
        .get_fields()
    );

    var fieldNames = '';

    ctx.executeQueryAsync(function() {
        fields.forEach(function(field, index) {
            var internalName = field.get_internalName(),
                title = field.get_title(),
                hidden = field.get_hidden();

            if (hidden !== true) {
                fieldNames = fieldNames.concat(internalName, ",");
                // for debugging
                console.log('Field ', index, ':');
                console.log('Title: ', title);
                console.log('InternalName: ', internalName);
                //console.log('Hidden: ', hidden);
            }
        });

        var items = ctx.get_web().get_lists().getByTitle(listName).getItems(SP.CamlQuery.createAllItemsQuery());

        ctx.load(items, "Include(" + fieldNames.slice(0, -1) + ")");

        ctx.executeQueryAsync(function () {
            var tasks = [];
            var factory = new TaskFactory();
            for (var i = 0, itemsCount = items.get_count() ; i < itemsCount; i++) {
                var fieldValues = items.itemAt(i).get_fieldValues();
                var diffDays = fieldValues.DueDate && fieldValues.DueDate > fieldValues.StartDate
                    ? Math.round(Math.abs((fieldValues.StartDate.getTime() - fieldValues.DueDate.getTime()) / (24 * 60 * 60 * 1000)))
                    : 1;
                var nT = factory.build(fieldValues.ID, fieldValues.Title, "", 0, fieldValues.StartDate.valueOf(), diffDays);
                nT.description = fieldValues.Body;
                nT.progress = fieldValues.PercentComplete * 100;
                nT.depends = getDepends(fieldValues.Predecessors);
                //if (typeof (window.ganttUseOneDayAsMilestone) !== 'undefined' && window.ganttUseOneDayAsMilestone === true) {
                //    if (fieldValues.DueDate.getTime() === fieldValues.StartDate.getTime()) {
                //        nT.startIsMilestone = nT.endIsMilestone = true;
                //    }
                //}
                tasks.push(nT);
            }

            var proj = new Object();
            proj.tasks = recalcDepends(tasks);
            proj.selectedRow = 0;
            proj.canWrite = true;
            proj.canWriteOnParent = true;
            ge.loadProject(proj);
            ge.checkpoint(); //empty the undo stack
        });
    });

    function getDepends(predessors) {

        var sPredessors = '';
        if (predessors && predessors.length !== 0) {
            for(var i=0, len=predessors.length; i<len; i++) {
                var predessorId = predessors[i].get_lookupId();
                sPredessors = sPredessors.concat(predessorId, ",");
            }
        }
        return sPredessors.slice(0, -1);
    }

    function recalcDepends(tasks) {

        var tasksLen = tasks.length;
        for (var i = 0; i < tasksLen; i++) {
            var task = tasks[i];
            if (task.depends === '') continue;
            var deps = task.depends.split(",");
            var depsRecalced = '';
            if (deps && deps.length > 0) {
                for (var j = 0, lenJ = deps.length; j < lenJ; j++) {
                    var dep = parseInt(deps[j]);
                    for (var k = 0; k < tasksLen; k++) {
                        if (tasks[k].id === dep) {
                            depsRecalced = depsRecalced.concat(k+1, ",");
                        }
                    }
                }
                task.depends = depsRecalced.slice(0, -1);
            }
        }
        return tasks;
    }

    // permission check for list
    //http://msdn.microsoft.com/en-us/library/office/jj838371(v=office.15).aspx
    //http://www.lifeonplanetgroove.com/checking-user-permissions-from-the-sharepoint-2013-rest-api/
    //https://sharepoint.stackexchange.com/questions/96676/sharepoint-2013-get-user-groups-by-csom
}

function saveGanttOnSpList() {
    
    var listName = 'Tasks';
    if (typeof window.ganttTaskListName !== 'undefined') {
        listName = window.ganttTaskListName;
    }

    var prj = ge.saveProject();

    delete prj.resources;
    delete prj.roles;

    var prof = new Profiler("saveServerSide");
    prof.reset();

    if (ge.deletedTaskIds.length > 0) {
        if (!confirm("TASK_THAT_WILL_BE_REMOVED\n" + ge.deletedTaskIds.length)) {
            return;
        }
    }

    var ctx = new SP.ClientContext.get_current();

    ctx.add_requestFailed(onQueryFailed);

    var fields = ctx.loadQuery(
        ctx
        .get_web()
        .get_lists()
        .getByTitle(listName)
        .get_fields()
    );

    var fieldNames = [];

    ctx.executeQueryAsync(function() {
        fields.forEach(function(field) {
            if (field.get_hidden() !== true) {
                fieldNames.push(field.get_internalName());
            }
        });

        var tasks = prj.tasks;
        var tasksLen = tasks.length;
        for (var i = 0; i < tasksLen; i++) {
            var task = tasks[i];

            var taskId = parseInt(task.id);
            if (taskId) {
                var oList = ctx.get_web().get_lists().getByTitle(listName);

                var oListItem = oList.getItemById(taskId);

                setFieldsInItem(oListItem, task);

                oListItem.update();

                ctx.executeQueryAsync();
            }
        }
    });

    function setFieldsInItem(oListItem, task) {
        
        for (var fn = 0, lenFn = fieldNames.length; fn<lenFn; fn++) {

            var fName = fieldNames[fn];
            switch(fName) {
            
                case 'Title':
                    oListItem.set_item(fName, task.name);
                    break;
                case 'StartDate':
                    oListItem.set_item(fName, new Date(task.start).toISOString());
                    break;
                case 'DueDate':
                    oListItem.set_item(fName, new Date(task.end).toISOString());
                    break;
                case 'Body':
                    oListItem.set_item(fName, task.description);
                    break;
            }
        }
    }

    function onQueryFailed(sender, args) {
        alert('Request failed. ' + args.get_message() +
            '\n\n' + args.get_stackTrace());
    }
}

//-------------------------------------------  Create some demo data ------------------------------------------------------
function setRoles() {
    ge.roles = [
      {
          id:"tmp_1",
          name:"Project Manager"
      },
      {
          id:"tmp_2",
          name:"Worker"
      },
      {
          id:"tmp_3",
          name:"Stakeholder/Customer"
      }
    ];
}

function setResource() {
    var res = [];
    for (var i = 1; i <= 10; i++) {
        res.push({id:"tmp_" + i,name:"Resource " + i});
    }
    ge.resources = res;
}


function editResources(){

}

function clearGantt() {
    ge.reset();
}

function loadI18n() {
    GanttMaster.messages = {
        "CANNOT_WRITE":                  "CANNOT_WRITE",
        "CHANGE_OUT_OF_SCOPE":"NO_RIGHTS_FOR_UPDATE_PARENTS_OUT_OF_EDITOR_SCOPE",
        "START_IS_MILESTONE":"START_IS_MILESTONE",
        "END_IS_MILESTONE":"END_IS_MILESTONE",
        "TASK_HAS_CONSTRAINTS":"TASK_HAS_CONSTRAINTS",
        "GANTT_ERROR_DEPENDS_ON_OPEN_TASK":"GANTT_ERROR_DEPENDS_ON_OPEN_TASK",
        "GANTT_ERROR_DESCENDANT_OF_CLOSED_TASK":"GANTT_ERROR_DESCENDANT_OF_CLOSED_TASK",
        "TASK_HAS_EXTERNAL_DEPS":"TASK_HAS_EXTERNAL_DEPS",
        "GANTT_ERROR_LOADING_DATA_TASK_REMOVED":"GANTT_ERROR_LOADING_DATA_TASK_REMOVED",
        "ERROR_SETTING_DATES":"ERROR_SETTING_DATES",
        "CIRCULAR_REFERENCE":"CIRCULAR_REFERENCE",
        "CANNOT_DEPENDS_ON_ANCESTORS":"CANNOT_DEPENDS_ON_ANCESTORS",
        "CANNOT_DEPENDS_ON_DESCENDANTS":"CANNOT_DEPENDS_ON_DESCENDANTS",
        "INVALID_DATE_FORMAT":"INVALID_DATE_FORMAT",
        "TASK_MOVE_INCONSISTENT_LEVEL":"TASK_MOVE_INCONSISTENT_LEVEL",

        "GANTT_QUARTER_SHORT":"trim.",
        "GANTT_SEMESTER_SHORT":"sem."
    };
}

//-------------------------------------------  Get project file as JSON (used for migrate project from gantt to Teamwork) ------------------------------------------------------
function getFile() {
    $("#gimBaPrj").val(JSON.stringify(ge.saveProject()));
    $("#gimmeBack").submit();
    $("#gimBaPrj").val("");

    /*  var uriContent = "data:text/html;charset=utf-8," + encodeURIComponent(JSON.stringify(prj));
     neww=window.open(uriContent,"dl");*/
}


//-------------------------------------------  LOCAL STORAGE MANAGEMENT (for this demo only) ------------------------------------------------------
Storage.prototype.setObject = function(key, value) {
    this.setItem(key, JSON.stringify(value));
};


Storage.prototype.getObject = function(key) {
    return this.getItem(key) && JSON.parse(this.getItem(key));
};


function loadFromLocalStorage() {
    var ret = null;
    if (localStorage) {
        if (localStorage.getObject("teamworkGantDemo")) {
            ret = localStorage.getObject("teamworkGantDemo");
        }
    } else {
        $("#taZone").show();
    }
    if (!ret || !ret.tasks || ret.tasks.length == 0){
        ret = JSON.parse($("#ta").val());


        //actualiza data
        var offset=new Date().getTime()-ret.tasks[0].start;
        for (var i=0;i<ret.tasks.length;i++)
            ret.tasks[i].start=ret.tasks[i].start+offset;


    }
    ge.loadProject(ret);
    ge.checkpoint(); //empty the undo stack
}


function saveInLocalStorage() {
    var prj = ge.saveProject();
    if (localStorage) {
        localStorage.setObject("teamworkGantDemo", prj);
    } else {
        $("#ta").val(JSON.stringify(prj));
    }
}

//-------------------------------------------  Open a black popup for managing resources. This is only an axample of implementation (usually resources come from server) ------------------------------------------------------

function editResources(){

    //make resource editor
    var resourceEditor = $.JST.createFromTemplate({}, "RESOURCE_EDITOR");
    var resTbl=resourceEditor.find("#resourcesTable");

    var lenR = ge.resources.length;
    for (var r = 0; r < lenR; r++) {
        resTbl.append($.JST.createFromTemplate(ge.resources[r], "RESOURCE_ROW"));
    }

    //bind add resource
    resourceEditor.find("#addResource").click(function(){
        resTbl.append($.JST.createFromTemplate({id:"new",name:"resource"}, "RESOURCE_ROW"));
    });

    //bind save event
    resourceEditor.find("#resSaveButton").click(function(){
        var newRes=[];
        //find for deleted res
        for (var i=0;i<lenR;i++){
            var res=ge.resources[i];
            var row = resourceEditor.find("[resId="+res.id+"]");
            if (row.size()>0){
                //if still there save it
                var inputNameById = row.find("input[name]").val();
                if (inputNameById && inputNameById!="")
                    res.name=inputNameById;
                newRes.push(res);
            } else {
                //remove assignments
                for (var j = 0, lenT = ge.tasks.length; j < lenT; j++) {
                    var task=ge.tasks[j];
                    var newAss=[];
                    for (var k = 0, lenA = task.assigs.length; k < lenA; k++) {
                        var ass=task.assigs[k];
                        if (ass.resourceId!=res.id)
                            newAss.push(ass);
                    }
                    task.assigs=newAss;
                }
            }
        }

        //loop on new rows
        resourceEditor.find("[resId=new]").each(function(){
            var inputNameNew = $(this).find("input[name]").val();
            if (inputNameNew && inputNameNew != "")
                newRes.push (new Resource("tmp_" + new Date().getTime(),inputNameNew));
        });

        ge.resources=newRes;

        closeBlackPopup();
        ge.redraw();
    });


    var ndo = createBlackPage(400, 500).append(resourceEditor);
}

$.JST.loadDecorator("ASSIGNMENT_ROW", function(assigTr, taskAssig) {

    var resEl = assigTr.find("[name=resourceId]");
    for (var i in taskAssig.task.master.resources) {
        var res = taskAssig.task.master.resources[i];
        var opt = $("<option>");
        opt.val(res.id).html(res.name);
        if (taskAssig.assig.resourceId == res.id)
            opt.attr("selected", "true");
        resEl.append(opt);
    }

    var roleEl = assigTr.find("[name=roleId]");
    for (var i in taskAssig.task.master.roles) {
        var role = taskAssig.task.master.roles[i];
        var optr = $("<option>");
        optr.val(role.id).html(role.name);
        if (taskAssig.assig.roleId == role.id)
            optr.attr("selected", "true");
        roleEl.append(optr);
    }

    if(taskAssig.task.master.canWrite && taskAssig.task.canWrite){
        assigTr.find(".delAssig").click(function() {
            var tr = $(this).closest("[assigId]").fadeOut(200, function() {
                $(this).remove();
            });
        });
    }


});