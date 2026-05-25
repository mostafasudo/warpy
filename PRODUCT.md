# Warpy

## Overview

B2B SaaS platforms often struggle with user engagement and onboarding due to complex interfaces. Our AI-powered Account Manager Agent solves this by letting users complete tasks through natural language commands, bypassing the traditional UI entirely. For example, a project management tool user could simply type "Create a new project for Q1 marketing campaign with 5 team members" instead of navigating through multiple menus. For B2B sales platforms, a user could ask "Schedule a demo with the enterprise lead from Acme Corp for next Tuesday" and the agent handles the rest. The widget will also ingest the knowledge base for instant answers to common questions.

## Motivation

- Feature discoverability: users may struggle to locate and utilize features, reducing the platform's overall value proposition.
- User onboarding challenges: complex dashboards can overwhelm new users, leading to steep learning curves and potential drop-offs.
- Support overhead: high volumes of support increase operational costs.

## Challenges

- Scalability: managing a large number of API endpoints may require dynamic loading of agent tools or implementing a system to handle endpoint prioritization.
- Security and compliance: ensuring secure handling of user data and maintaining compliance with industry standards is paramount, especially when bypassing traditional front-end security measures.
- User adoption: encouraging users to transition from traditional interfaces to an AI-driven interaction model will require intuitive design and demonstrable reliability.
- API reference must be clean: the document containing the API reference of the user must be very clean, most early stage businesses don’t have that, you will find in their codebase lots of enums passed as strings.
- API endpoints keeps getting changed and updated frequently.
- First in market: there are 0 products currently in market that do this, or do something similar, we will be the first, which would be very challenging in terms of explaining this product to possible users and difficult in sales and marketing.
- Computer Use / Operator: the whole point of this product is to help users skip complex UIs to get things done easily by chatting with a widget, Computer Use AI Systems such as Operator by OpenAI could do the exact same functionality by making the agent take control over the browser and navigating the complex UI and getting the task done for you, though today we are so far from this, due to these reason:
- Though it requires chrome extension or user launching chrome with CDP, not doable via a script tag.
  
## Valuable resources

- The Weird Death Of User Interfaces: https://www.youtube.com/watch?v=KG4ONHqF1qg&list=WL&index=1
- Claude Extention: https://www.youtube.com/watch?v=IypXvHej9eY&t=78s
- Clay's Sculpture, PostHog AI
