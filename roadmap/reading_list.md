I want to have a Reading List plugin for the Angry Cat Zulip client (this project).

The Reading List should be based on a Generic Todo List, which we will build first.

A generic Todo List should have a bunch of tasks, and then you can add tasks, move
tasks using drag and drop, mark tasks as done, or completely remove tasks.

Angry Cat has a plugin architecture.  Everything in the plugin architecture basically
has one entry point.  A plugin creates a div element that it returns to its caller.
And then that div does all the work.

We want to build the todo list similar to how other things are built here:

* no external CSS
* use the DOM directly
* build small TypeScript components to store the state

After we build the Todo List plugin, we will make it into a Reading List.

Each "todo" in the Reading List will be a link to a Zulip topic or Zulip message.
I will explain to Claude how to build those topic links and message links.

When you select a topic, we will let you add a topic to the reading list with a
new button called "Read Later" in the same row as "Mark topic read".  Then the
topic will be added to the reading list.

Just to be clear, we are going to keep the reading list all in memory for now.
We will figure out how to permanently persist it later.

We will also let you add links to specific messages.  When you click on a message
now, we show you some information about the message in a popup. We will add a button
called "Read Later" that adds it to the reading list.

We will flesh out more details later.  To summarize the overall direction:

* Create a generic Todo Plugin that follows the style of Angry Cat code (in general).
* Make the Reading List be a Todo List with links to topics and messages.
* Create convenient buttons in the existing navigation UI to add topics and messages to the reading list.
