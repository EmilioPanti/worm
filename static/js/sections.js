/** SECTIONS **/

function viewSection(identifier){
    let parent = $('#'+identifier);
    $(parent).insertBefore($('#atomic-blocks-end'));
    $(parent).css('display', 'block');
    window.location.hash='#'+identifier;
}

function clearWorkflow(){
    $('.section-profile').each(function(){ $(this).css('display', 'none'); });
}

function showHide(show, hide) {
    $(show).each(function(){$(this).prop('disabled', false).css('opacity', 1.0)});
    $(hide).each(function(){$(this).prop('disabled', true).css('opacity', 0.5)});
}


/** WORMS **/

let atomic_interval = null;

function toggleWormView(){
    $('#viewWorm').toggle();
    $('#addWorm').toggle();

    if ($('#togBtnWorm').is(':checked')) {
        showHide('.queueOption,#btnStartWorm', '#worms');
    } else {
        showHide('#worms', '.queueOption,#btnStartWorm');
    }
}

function handleStopWorm(){
    let selectedWormId = $('#worms option:selected').attr('id');
    restRequest('PUT', {'index':'worm', 'id':selectedWormId}, handleStopWormCallback, '/plugin/worm/stop');
}

function handleStopWormCallback(data){
    $('#btnStopWorm').prop('disabled', true).css('opacity', 0.5);
}

function handleStartWorm(){
    let name = document.getElementById("queueName").value;
    if(!name){alert('Please enter a worm-operation name!'); return; }

    let jitter = document.getElementById("queueJitter").value || "2/8";
    try {
        let [jitterMin, jitterMax] = jitter.split("/");
        jitterMin = parseInt(jitterMin);
        jitterMax = parseInt(jitterMax);
        if(!jitterMin || !jitterMax){
            throw true;
        }
        if(jitterMin >= jitterMax){
            alert('Jitter MIN must be less than the jitter MAX.');
            return;
        }
    } catch (e) {
        alert('Jitter must be of the form "min/max" (e.x. 2/8)');
        return;
    }

    let stop_at_first_goals = null;
    let goal_id = document.getElementById("queueGoal").value;
    if (goal_id === "") {
        goal_id = null;
    }
    else {
        stop_at_first_goals = document.getElementById("queuePolicy").value;
    }

    let queueDetails = {
        "index":"worm",
        "name":name,
        "group":document.getElementById("queueGroup").value,
        "adversary_id":document.getElementById("queueFlow").value,
        "planner":document.getElementById("queuePlanner").value,
        "jitter":jitter,
        "sources":[document.getElementById("queueSource").value],
        "allow_untrusted":document.getElementById("queueUntrusted").value,
        "goal_id":goal_id,
        "stop_at_first_goals":stop_at_first_goals
    };
    restRequest('PUT', queueDetails, handleStartWormCallback, '/plugin/worm/rest');
}

function handleStartWormCallback(data){
    $("#togBtnWorm").prop("checked", false).change();
    restRequest('POST', {'index':'worm'}, reloadWormsElements, '/plugin/worm/rest');
}

function reloadWormsElements(data){
    let worm_elem = $("#worms");
    $.each(data, function(index, w) {
        if(!worm_elem.find('option[value="'+w.id+'"]').length > 0){
            worm_elem.append('<option id="' + w.id + '" class="wormOption" ' + 
                'value="' + w.id + '">' + w.op.name + ' - ' + w.op.start + '</option>');
        }
    });
    worm_elem.prop('selectedIndex', worm_elem.find('option').length-1).change();
}


function refresh() {
    let selectedWormId = $('#worms option:selected').attr('value');
    let postData = selectedWormId ? {'index':'worm','id': selectedWormId} : null;
    restRequest('POST', postData, wormCallback,'/plugin/worm/full');
}


function wormCallback(data){
    let worm = data[0];
    let operation = worm.op;
    $("#dash-start").html(operation.start);
    $("#dash-finish").html(operation.finish);
    $("#dash-group").html(worm.starting_group);
    $("#dash-flow").html(operation.adversary.name);
    if(worm.goal_id != null) {
        $("#dash-goal").html(worm.goal.name);
        let goal_agent = operation.host_group.filter(item => item.status === 'goal_agent');
        if(goal_agent.length) {
            $("#dash-status").css('color', '#a2ff00');
            $("#dash-status").html("SUCCESS");
        } else if (worm.terminated == 1 && operation.finish == null) {
            $("#dash-status").css('color', 'yellow');
            $("#dash-status").html("STOPPING");
        } else if (operation.finish == null) {
            $("#dash-status").css('color', 'yellow');
            $("#dash-status").html("SEARCHING");
        }else {
            $("#dash-status").css('color', 'red');
            $("#dash-status").html("FAILED");
        }
    } else {
        $('#dash-goal').html('---');
        $("#dash-status").css('color', 'yellow');
        if (operation.finish != null) {
            $("#dash-status").html("ENDED");
        } else if (worm.terminated == 1) {
            $("#dash-status").html("STOPPING");
        }else {
            $("#dash-status").html("EXPANSION");
        }
    }
    agents_family_tree(worm.op.host_group);

    if (worm.terminated == 0 && worm.op.finish == null) {
        $('#btnStopWorm').prop('disabled', false).css('opacity', 1.0);
    }else {
        $('#btnStopWorm').prop('disabled', true).css('opacity', 0.5);
    }

    clearTimeline(operation.id);
    for(let i=0;i<operation.chain.length;i++){
        if($("#op_id_" + operation.chain[i].id).length === 0) {
            let template = $("#link-template").clone();
            let ability = operation.abilities.filter(item => item.id === operation.chain[i].ability)[0];
            template.find('#link-description').html(operation.chain[i].abilityDescription);
            let title = operation.chain[i].abilityName;
            if(operation.chain[i].cleanup) {
                title = title + " (CLEANUP)"
            }
            template.find('#link-technique').html(ability.technique_id + '<span class="tooltiptext">' + ability.technique_name + '</span>');
            template.attr("id", "op_id_" + operation.chain[i].id);
            template.attr("operation", operation.chain[i].op_id);
            template.attr("data-date", operation.chain[i].decide.split('.')[0]);
            template.find('#time-tactic').html('<div style="font-size: 13px;font-weight:100" ' +
            'onclick="rollup('+operation.chain[i].id+')">'+ operation.chain[i].paw + '... ' +
                title + '<span style="font-size:14px;float:right" ' +
            'onclick="findResults(this, '+operation.chain[i].id+')"' +
            'data-encoded-cmd="'+operation.chain[i].command+'"'+'>&#9733;</span></div>');
            template.find('#time-action').html(atob(operation.chain[i].command));
            template.find('#time-executor').html(operation.chain[i].executor);
            refreshUpdatableFields(operation.chain[i], template);

            template.insertBefore("#time-start");
            $(template.find("#inner-contents")).slideUp();
            template.show();
        } else {
            let existing = $("#op_id_"+operation.chain[i].id);
            refreshUpdatableFields(operation.chain[i], existing);
        }
    }
    if(operation.finish != null) {
        console.log("Turning off refresh interval for page");
        clearInterval(atomic_interval);
        atomic_interval = null;
    } else {
        if(!atomic_interval) {
            console.log("Setting refresh interval for page");
            atomic_interval = setInterval(refresh, 5000);
        }
    }
}

function clearTimeline(op_id) {
    $('.event').each(function() {
        let opId = $(this).attr('operation');
        if(opId && opId !== op_id) {
            $(this).remove();
        }
    });
}

function refreshUpdatableFields(chain, div){
    if(chain.collect) {
        div.find('#'+chain.id+'-rm').remove();
        div.find('#link-collect').html(chain.collect.split('.')[0]);
    }
    if(chain.finish) {
        div.find('#'+chain.id+'-rs').css('display', 'block');
        div.find('#'+chain.id+'-rm').remove();
        div.find('#link-finish').html(chain.finish.split('.')[0]);
    }
    if(chain.status === 0) {
        applyTimelineColor(div, 'success');
    } else if (chain.status === -2) {
        div.find('#'+chain.id+'-rm').remove();
        applyTimelineColor(div, 'discarded');
    } else if (chain.status === 1) {
        applyTimelineColor(div, 'failure');
    } else if (chain.status === 124) {
        applyTimelineColor(div, 'timeout');
    } else if (chain.status === -3 && chain.collect) {
        applyTimelineColor(div, 'collected');
    } else {
        applyTimelineColor(div, 'queued');
    }
}

function applyTimelineColor(div, color) {
    div.removeClass('collected');
    div.removeClass('queued');
    div.addClass(color);
}

function rollup(id) {
    let inner = $("#op_id_"+id).find("#inner-contents");
    if ($("#op_id_"+id).find("#inner-contents").is(":visible")) {
        $(inner).slideUp();
    } else {
        $(inner).slideDown();
    }
}

function findResults(elem, link_id){
    document.getElementById('more-modal').style.display='block';
    $('#resultCmd').html(atob($(elem).attr('data-encoded-cmd')));
    restRequest('POST', {'index':'core_result','link_id':link_id}, loadResults, '/plugin/worm/rest');
}

function loadResults(data){
    if (data[0]) {
        let res = atob(data[0].output);
        $.each(data[0].link.facts, function (k, v) {
            let regex = new RegExp(v.value, "g");
            res = res.replace(regex, "<span class='highlight'>" + v.value + "</span>");
        });
        $('#resultView').html(res);
    }
}

function checkWormAdv(){
    $('#queuePolicy').prop('disabled', true).css('opacity', 0.5);
    let adv_id = $('#queueFlow option:selected').attr('id');
    restRequest('POST', {'index':'goal', 'adversary_id':adv_id}, checkWormAdvCallback, '/plugin/worm/rest');
    checkWormFormValid();
}

function checkWormAdvCallback(data){
    let goals = $("#queueGoal");
    document.getElementById("queueGoal").options.length = 0;
    goals.append('<option value="" disabled selected>Set no goal</option>');
    $.each(data, function(index, g) {
        goals.append('<option value="' + g.id + '">' + g.name + '</option>');
    });
}

function checkWormFormValid(){
    if (document.getElementById("queueGoal").value !== "") {
        showHide('.policyOption', null);
    } else {
        showHide(null, '.policyOption');
    }
    validateWormFormState(($('#queueName').val()) && ($('#queueFlow').prop('selectedIndex') !== 0) && 
        ($('#queueGroup').prop('selectedIndex') !== 0) ,'#btnStartWorm');
}

function validateWormFormState(conditions, selector){
    (conditions) ?
        updateButtonState(selector, 'valid') :
        updateButtonState(selector, 'invalid');
}

function rec_agents_tree_txt(arr, deep) {
    let text = "";
    for (let i = 0; i < arr.length; i++) {
        let element = arr[i];
        if(deep > 0) {
            let space = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
            text += space.repeat(deep);
        }
        text += "&nbsp;&nbsp;--->";
        if (element.status === 'goal_agent') text += '<font color=#a2ff00>' + element.paw + ":</font><br>";
        else text += element.paw + ":<br>";
        if (typeof element.children !== 'undefined' && element.children.length > 0) {
            text += rec_agents_tree_txt(element.children, deep+1);
        }
    }
    return text;
}

function rec_get_children(father, potential_children) {
    let children = potential_children.filter(function( obj ) {
        return obj.father === father;
    });
    children.forEach(function(item) {
        item.children = rec_get_children(item.paw, potential_children);
    });
    return children;
}

function get_orphans_agents(agents, potential_orphans) {
    let text = '';
    potential_orphans.forEach(function(orphan) {
        let father = agents.filter(agent => agent.paw === orphan.father);
        if (typeof father === 'undefined' || father.length < 1) {
            if (orphan.status === 'goal_agent') 
                text += '&nbsp;&nbsp;<font color=#a2ff00>' + orphan.paw + "</font><br>";
            else text += '&nbsp;&nbsp;' + orphan.paw + "<br>";
        }
    });
    return text;
}

function agents_family_tree(agents) {
    let starters = agents.filter(function( obj ) {
        return obj.starter === 1;
    });
    let no_starters = agents.filter(function( obj ) {
        return obj.starter !== 1;
    });
    starters.forEach(function(starter) {
        starter.children = rec_get_children(starter.paw, no_starters);
    });
    let text = rec_agents_tree_txt(starters, 0);

    $('#family').remove();
    $('#orphans').remove();
    let templateFamily = $("#agent-map-template").clone();
    templateFamily.attr('id', 'family');
    templateFamily.find('#header').html('<b>AGENTS FAMILY TREE:</b>');
    templateFamily.find('#content').html(text);
    templateFamily.show();
    $("#profile-agent-map").append(templateFamily);

    let textOrphans = get_orphans_agents(agents, no_starters);
    if (textOrphans !== '') {
        let templateOrphans = $("#agent-map-template").clone();
        templateOrphans.attr('id', 'orphans');
        templateOrphans.find('#header').html('<b>ORPHANS AGENTS:</b>');
        templateOrphans.find('#content').html(textOrphans);
        templateOrphans.show();
        $("#profile-agent-map").append(templateOrphans);
        
    }
}


/** GOALS  **/

function checkGoalAdv() {
    let selectedGaolAdvId = $('#goalAdv option:selected').attr('id');
    if (selectedGaolAdvId !== ''){
        $('#goalAddClause').prop('disabled', false).css('opacity', 1.0);
        let selectedGaolAdvName = $('#goalAdv option:selected').attr('value');
        $('#goal-adversary').val('adversary: ' + selectedGaolAdvName);
        //clear out canvas
        $('#goal-name').val('');
        $('#goal-description').val('');
        $('.tempClause').remove();
        $('.clause-headers').remove();
        loadAdversary($('#goalAdv option:selected').attr('id'));
    } else {
        $('#goalAddClause').prop('disabled', true).css('opacity', 0.5);
    }
}

function toggleGoalView() {
    $('#viewGoal').toggle();
    $('#addGoal').toggle();

    //clear out canvas
    $('#goal-name').val('');
    $('#goal-description').val('');
    $('#goal-adversary').val('');
    $('.tempClause').remove();
    $('.clause-headers').remove();
    $('#advNewGoal').prop('disabled', true).css('opacity', 0.5);
}

function addClause(number) {
    let template = $("#clause-template").clone();
    if(number == null) {
        let existingClauses = $('.tempClause').length;
        number = existingClauses + 1;
    }
    template.attr("id", "tempClause" + number);
    template.addClass("tempClause");
    template.insertBefore('#dummy');
    template.show();
    let clauseHeader = $('<h4 class="clause-headers">Clause ' + number +'&nbsp&nbsp&nbsp;<span onclick="showClauseModal('+number+')">&#10010;</span><hr></h4>');
    clauseHeader.insertBefore("#tempClause" + number);
    clauseHeader.show();
    return template;
}

function saveNewGoal() {
    let name = $('#goal-name').val();
    if(!name){alert('Please enter a goal name!'); return; }
    else {
        //check duplicates
        if($("#profile-existing-name option[value='" + name + "']").length > 0){
            alert('This goal name is already used!');
            return;
        }
    }
    let description = $('#goal-description').val();
    if(!description){alert('Please enter a description!'); return; }

    let literals = [];
    $('#profile-tests-literal li').each(function() {
        literals.push({"clause":$(this).data('clause'), "type":$(this).data('type'),
            "name":$(this).data('name'), "value":$(this).data('value')})
    });

    let adv;
    if ($('#togBtnGoal').is(':checked')) {
        adv = $('#goalAdv option:selected').attr('id');
    } else {
        let advName = $('#goal-adversary').val();
        adv = $("#goalAdv option[value='" + advName + "']").attr('id');
    }

    let goalData = {
        "index":"goal",
        "name":name,
        "description":description,
        "adversary_id":adv,
        "clauses":literals,
        "i":uuidv4()
    };
    restRequest('PUT', goalData, reloadLocation, '/plugin/worm/rest');
}

function loadGoal() {
    restRequest('POST', {'index':'goal', 'id': $('#profile-existing-name option:selected').attr('id')}, loadGoalCallback, '/plugin/worm/rest');
}

function loadGoalCallback(data) {
    $('#goal-name').val(data[0]['name']);
    $('#goal-description').val(data[0]['description']);
    let nameAdv = $("#goalAdv option[id='" + data[0]['adversary_id'] + "']").val();
    let idAdv = $("#goalAdv option[id='" + data[0]['adversary_id'] + "']").attr('id');
    $('#goal-adversary').val(nameAdv);

    $('.tempClause').remove();
    $('.clause-headers').remove();

    $.each(data[0]['clauses'], function(clause, literals) {
        let clauseInt = parseInt(clause, 10);
        let template = addClause(clauseInt);
        literals.forEach(function(l) {
            let literalBox = buildLiteral(l.type, l.name, l.value, clauseInt);
            template.find('#profile-tests-literal').append(literalBox);
        });
    });
    checkLiteralsNumber();
    loadAdversary(idAdv);
}

function buildLiteral(type, name, value, clause){
    let literal_id = ("" + clause + type + name + value).replace(/\./g,'-');
    literal_id = literal_id.replace(/[^a-zA-Z0-9]/g, '');
    let template = $("#literal-template").clone();
    template.attr('id', literal_id)
        .data('name', name)
        .data('type', type)
        .data('value', value)
        .data('clause', clause);

    let htmlCondition;
    let htmlCont = name + " = '" + value + "'";
    if (htmlCont.length > 55) {htmlCont = htmlCont.substring(0, 54);}
    if (type === 'host-fact') {
        htmlCondition = '<div class="tooltip-literal"><span class="tooltiptext-literal">Collectible host-fact</span><img src="/chain/img/facts.png" style="float: left"/></div>&nbsp;' + htmlCont;
    } else {
        htmlCondition = '<div class="tooltip-literal"><span class="tooltiptext-literal">Agent property</span><img src="/chain/img/hacker.png" style="float: left"/></div>&nbsp;' + htmlCont;
    }
    template.find('#condition').html(htmlCondition);

    template.find('#literal-remove').click(function() {
        removeLiteral(literal_id);
    });
    template.show();
    return template;
}

function removeLiteral(literal_id){
    $('#'+literal_id).remove();
    checkLiteralsNumber();
}

function showClauseModal(clause) {
    $('#clause-modal').data("clause", clause);
    //reset select
    let parent = $('#clause-modal');
    $(parent).find('#literal-type').empty().append('<option value="" disabled selected>Choose the type</option>');
    $(parent).find('#literal-type').append('<option value="host-fact"> Collectible host-fact </option>');
    $(parent).find('#literal-type').append('<option value="property"> Agent property</option>');
    $(parent).find('#literal-name').prop('disabled', true).css('opacity', 0.5);
    $(parent).find('#literal-name').empty();
    $(parent).find('#literal-value').prop('disabled', true).css('opacity', 0.5);
    $(parent).find('#literal-value').val('');
    document.getElementById("clause-modal").style.display="block";
}

function addToClause() {
    let value = $('#clause-modal').find('#literal-value').val();
    if((!value) || (value === "")){alert('Please enter a value!'); return; }
    let parent = $('#clause-modal');
    let clause = $(parent).data('clause');
    let type = $('#clause-modal').find('#literal-type').val();
    let name = $('#clause-modal').find('#literal-name').val();
    let literalBox = buildLiteral(type, name, value, clause);
    //check duplicates
    if($('#tempClause' + clause).find('#profile-tests-literal').find('#'+literalBox.attr('id')).length > 0){
        alert('Condition already present in this clause!');
        return;
    }
    $('#tempClause' + clause).find('#profile-tests-literal').append(literalBox);
    document.getElementById('clause-modal').style.display='none';
    checkLiteralsNumber();
}

function checkLiteralType() {
    let selectedLiteralType = $('#literal-type option:selected').attr('value');
    if (selectedLiteralType !== ""){
        $('#literal-name').prop('disabled', false).css('opacity', 1.0);
    } else {
        $('#literal-name').prop('disabled', true).css('opacity', 0.5);
        return;
    }
    document.getElementById("literal-name").options.length = 0;
    let literalName = $("#literal-name");
    if (selectedLiteralType === 'host-fact'){
        let hostFacts = $('#clause-modal').data("host-facts-list");
        let literalName = $("#literal-name");
        literalName.append('<option value="" disabled selected>Select a host-fact</option>');
        hostFacts.forEach(function(f) {
            literalName.append('<option id="' + f + ' value="' + f +'">' + f + '</option>');
        });
    } else {
        literalName.append('<option value="" disabled selected>Select a property</option>');
        let agentProperties = ['paw', 'architecture', 'platform', 'location', 'pid', 'ppid', 'father'];
        agentProperties.forEach(function(p) {
            literalName.append('<option id="' + p + ' value="' + p +'">' + p + '</option>');
        });
    }
}

function checkLiteralName() {
    let selectedLiteralName = $('#literal-name option:selected').attr('value');
    if (selectedLiteralName !== ""){
        $('#literal-value').prop('disabled', false).css('opacity', 1.0);
    } else {
        $('#literal-value').prop('disabled', true).css('opacity', 0.5);
    }
}

function checkLiteralValue() {
    validateFormState(true, '#clauseBtn');
}

function loadAdversary(adversaryId) {
    restRequest('POST', {'index':'core_adversary', 'adversary_id': adversaryId}, loadAdversaryCallback, '/plugin/worm/rest');
}

function loadAdversaryCallback(data) {
    let hostFacts = [];
    data[0]['facts'].forEach(function(f) {
        if(f.startsWith('host')) {
            if(!hostFacts.includes(f)){
                hostFacts.push(f);
            }
        }
    });
    $('#clause-modal').data("host-facts-list", hostFacts);
}

function checkLiteralsNumber() {
    let $numLits = $('.tooltip-literal');
    if($numLits.length) {
        $('#advNewGoal').prop('disabled', false).css('opacity', 1.0);
    } else {
        $('#advNewGoal').prop('disabled', true).css('opacity', 0.5);
    }
}



/** AGENTS **/

$(document).ready(function () {
    $('#netTbl').DataTable({})
}); 

function refreshAgentTable() {
    //reset
    $('#goalGroup').prop('disabled', true).css('opacity', 0.5);
    $('#noGoalGroup').prop('disabled', true).css('opacity', 0.5);
    $('#goalGroup').val('');
    $('#noGoalGroup').val('');
    $('#splitBtn').prop('disabled', true).css('opacity', 0.5);

    let selectedWormId = $('#wormsAgents option:selected').attr('value');
    let postData = selectedWormId ? {'index':'worm','id': selectedWormId} : null;
    restRequest('POST', postData, refreshAgentTableCallback, '/plugin/worm/rest');
    if (selectedWormId > 0){
        $('#goalsAgents').prop('disabled', false).css('opacity', 1.0);
    } else {
        $('#goalsAgents').prop('disabled', true).css('opacity', 0.5);
    } 
}

function refreshAgentTableCallback(data) {
    document.getElementById("goalsAgents").options.length = 0;
    let adversary_id;
    if(data[0].goal_id == null) {
        $("#goalsAgents").append('<option value="" disabled selected>No reference goal</option>');
        adversary_id = $("#queueFlow option[value='" + data[0].op.adversary_id + "']").attr('id');
    } else {
        adversary_id = data[0].goal.adversary_id;
    }
    restRequest('POST', {'index':'goal', 'adversary_id':adversary_id}, updateGoalsSelect, '/plugin/worm/rest');
    if(data[0].goal_id != null) {
        $("#goalsAgents").find('#'+data[0].goal_id).prop('selected', true);
        $('#goalGroup').prop('disabled', false).css('opacity', 1.0);
        $('#noGoalGroup').prop('disabled', false).css('opacity', 1.0);
    }
    updateAgentsTable(data[0].op.host_group);
}

function updateGoalsSelect(data){
    if (data.length > 0) {
        let goals = $("#goalsAgents");
        $.each(data, function(index, g) {
            goals.append('<option id="' + g.id + '" value="' + g.id + '">' + g.name + '</option>');
        });
    } else {
        $("#goalsAgents").append('<option value="" disabled selected>No goals for this adversary</option>');
    }
}

function updateAgentsTable(agents){
    $('.odd').remove();
    $('.tempAgent').remove();
    let goalId = $('#goalsAgents option:selected').attr('value');
    agents.forEach(function(a) {
        let htmlGoalAgent;
        if (goalId !== '') {
            if (a.status === 'goal_agent') {
                htmlGoalAgent = '<span style="color: #a2ff00">YES</span>';
            } else {
                htmlGoalAgent = '<span style="color: red">NO</span>';
            }
        } else {
            htmlGoalAgent = '---';
        }
        let htmlExecutors = '';
        (a.executors).forEach(function(e) {
            htmlExecutors += e.executor + '<br />';
        });
        let newRow = '<tr id="' + a.id + '" value="' + a.status + '" class="tempAgent">' + 
                    '<td>' + a.paw + '</td>' + 
                    '<td style="width:125px">' + htmlGoalAgent + '</td>' + 
                    '<td>' + a.platform + '</td>' +
                    '<td>' + htmlExecutors + '</td>' +
                    '<td>' + a.last_seen + '</td>' +
                    '<td>' + a.pid + '</td>' +
                    '<td>' + a.host_group + '</td></tr>';
        $("#netTblBody").append(newRow);              
    });
}

function relateGoal() {
    let selectedWormId = $('#wormsAgents option:selected').attr('value');
    let selectedGoalId = $('#goalsAgents option:selected').attr('value');
    let postData = {'index':'relate_worm_goal','worm_id':selectedWormId, 'goal_id':selectedGoalId};
    restRequest('POST', postData, updateAgentsTable, '/plugin/worm/rest');

    if (selectedGoalId === '') {
        $('#goalGroup').prop('disabled', true).css('opacity', 0.5);
        $('#noGoalGroup').prop('disabled', true).css('opacity', 0.5);
    } else {
        $('#goalGroup').prop('disabled', false).css('opacity', 1.0);
        $('#noGoalGroup').prop('disabled', false).css('opacity', 1.0);
    }
    $('#goalGroup').val('');
    $('#noGoalGroup').val('');
    $('#splitBtn').prop('disabled', true).css('opacity', 0.5);
}

function checkSplitValid(){
    if ( ($('#goalGroup').val() !== '') && ($('#noGoalGroup').val() !== '')) {
        $('#splitBtn').prop('disabled', false).css('opacity', 1.0);
    } else {
        $('#splitBtn').prop('disabled', true).css('opacity', 0.5);
    }
}

function splitAgents(){
    let goalGroup = $('#goalGroup').val();
    let noGoalGroup = $('#noGoalGroup').val();
    let goalAgents = [];
    let noGoalAgents = [];
    if(goalGroup === noGoalGroup){alert('Please enter two distinct names for the groups!'); return; }
    $('.tempAgent').each(function() {
        console.log("tempAgent trovato");
        let id = $(this).attr('id');
        let status = $(this).attr('value');
        if (status === 'goal_agent') {
            goalAgents.push(id);
        } else {
            noGoalAgents.push(id);
        }
    });
    let data = {"index":"split_agent", "goal_agents": goalAgents, "no_goal_agents": noGoalAgents, "goal_group": goalGroup, "no_goal_group": noGoalGroup};
    restRequest('PUT', data, reloadLocation, '/plugin/worm/agents/split');
}

function reloadLocation(data){ location.reload(true); }



/** REPORTS **/

function showReports(){
    validateFormState(($('#reports').prop('selectedIndex') !== 0), '#reportBtn');
    let selectedWormId = $('#reports option:selected').attr('value');
    let postData = selectedWormId ? {'index':'worm_report', 'worm_id': selectedWormId} : null;
    restRequest('POST', postData, displayReport, '/plugin/worm/rest');
}

function displayReport(data) {
    $('#report-name').html(data.name);
    $('#report-name-duration').html("The operation lasted " + reportDuration(data.start, data.finish) + " with a random "+data.jitter + " second pause between steps");
    $('#report-adversary').html(data.adversary.name);
    $('#report-adversary-desc').html(data.adversary.description);
    $('#report-group').html(data.starting_group);
    $('#report-group-cnt').html(data.host_group.length + ' hosts were included');
    $('#report-steps').html(reportStepLength(data.steps));
    $('#report-steps-attack').html(data.adversary.name + " was " + reportScore(data.steps) + " successful in the attack");
    $('#report-planner').html(data.planner.name);
    $('#report-planner-desc').html(data.adversary.name + " collected " + data.facts.length + " facts and used them to make decisions");
    if (data.goal === null) {
        $('#report-goal').html('---');
        $('#report-goal-desc').html('Worm-operation executed without goal');
        $('#report-policy').html('---');
        $('#report-policy-desc').html('');
        $('#report-goal-agents').html('---');
        $('#report-goal-agents-list').html('');
    } else {
        $('#report-goal').html(data.goal.name);
        $('#report-goal-desc').html(data.goal.description);
        addGoalAgentsInfo(data.host_group);
        if (data.stop_at_first_goals) {
            $('#report-policy').html('policy');
            $('#report-policy-desc').html('Stop at the first goal-agents reached');
        } else {
            $('#report-policy').html('policy');
            $('#report-policy-desc').html('Expand as long as possible');
        }
    }
    addAttackBreakdown(data.adversary.phases, data.steps);
    addFacts(data.facts);
}

function reportDuration(start, end) {
    let operationInSeconds = Math.abs(new Date(end) - new Date(start)) / 1000;
    let operationInMinutes = Math.floor(operationInSeconds / 60) % 60;
    operationInSeconds -= operationInMinutes * 60;
    let secondsRemainder = operationInSeconds % 60;
    return operationInMinutes+'min '+secondsRemainder+'sec';
}

function reportStepLength(steps) {
    let step_len = 0;
    for ( let agent in steps ){
        step_len += steps[agent].steps.length;
    }
    return step_len;
}

function reportScore(steps) {
    let failed = 0;
    for ( let agent in steps ) {
        steps[agent].steps.forEach(s => {
        if(s.status > 0) {
            failed += 1;
        }
    });
    }
    return parseInt(100 - (failed/reportStepLength(steps) * 100)) + '%';
}

function addAttackBreakdown(phases, steps) {
    $("#reports-dash-attack").find("tr:gt(0)").remove();
    let plans = [];
    $.each(phases, function (k, v) {
        v.forEach(plannedStep => {
            if(!plans.some(e => e.tactic == plannedStep.tactic) || !plans.some(e => e.technique_id == plannedStep.technique_id) || !plans.some(e => e.technique_name == plannedStep.technique_name)) {
                plans.push({'tactic': plannedStep.tactic, 'technique_id': plannedStep.technique_id, 'technique_name': plannedStep.technique_name, "success": 0, "failure": 0});
            }
        });
    });
    plans.forEach(p => {
        for ( let agent in steps ) {
            steps[agent].steps.forEach(s => {
                if (p.tactic == s.attack.tactic && p.technique_id == s.attack.technique_id && p.technique_name == s.attack.technique_name) {
                    if (s.status > 0) {
                        p['failure'] += 1;
                    } else {
                        p['success'] += 1;
                    }
                }
            });
        }
    });
    plans.forEach(p => {
        $("#reports-dash-attack").append("<tr><td><span style='color:green'>"+p.success+"</span> / <span style='color:red'>"+p.failure+"</span></td><td>"+p.tactic+"</td><td>"+p.technique_id+"</td><td>"+p.technique_name+"</td></tr>");
    });
}

function addFacts(facts){
    $("#reports-dash-facts").find("tr:gt(0)").remove();
    let unique = [];
    facts.forEach(f => {
        let found = false;
        for(let i in unique){
            if(unique[i].property == f.property) {
                unique[i].count += 1;
                found = true;
                break;
            }
        }
        if(!found) {
            unique.push({'property':f.property, 'count':1});
        }
    });
    unique.forEach(u => {
        $("#reports-dash-facts").append("<tr><td>"+u.property+"<td><td>"+u.count+"</td></tr>");
    });
}

function addGoalAgentsInfo(agents){
    let goal_agents = agents.filter(item => item.status === 'goal_agent');
    if(goal_agents.length) {
        let perc = Math.round(goal_agents.length/agents.length * 100) + '%';
        $('#report-goal-agents').html('<span style="color: #a2ff00;">' + goal_agents.length + ' (' + perc + ')</span>');
        let list = '';
        goal_agents.forEach(function(item) {
            list += item.paw + '<br>';
        });
        $('#report-goal-agents-list').html(list);
    } else {
        $('#report-goal-agents').html('<span style="color: red;">0</span>');
        $('#report-goal-agents-list').html('No goal-agent found');
    }
}

function downloadWormReport() {
    function downloadObjectAsJson(data){
        let WormOperationName = data['name'];
        let exportName = 'worm_operation_report_' + WormOperationName;
        let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        let downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", exportName + ".json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    let selectedWormId = $('#reports option:selected').attr('value');
    let postData = selectedWormId ? {'index':'worm_report', 'worm_id': selectedWormId} : null;
    restRequest('POST', postData, downloadObjectAsJson, '/plugin/worm/rest');
}


/* UTILITY */

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function resetMoreModal() {
    let modal = $('#more-modal');
    modal.hide();
    modal.find('#resultCmd').text('');
    modal.find('#resultView').text('');
}