# Warpy

## Overview

B2B SaaS platforms often struggle with user engagement and onboarding due to complex interfaces. Our AI-powered Account Manager Agent solves this by letting users complete tasks through natural language commands, bypassing the traditional UI entirely. For example, a project management tool user could simply type "Create a new project for Q1 marketing campaign with 5 team members" instead of navigating through multiple menus. For B2B sales platforms, a user could ask "Schedule a demo with the enterprise lead from Acme Corp for next Tuesday" and the agent handles the rest. The widget will also ingest the knowledge base for instant answers to common questions.

## Motivation

- Feature discoverability: users may struggle to locate and utilize features, reducing the platform's overall value proposition.
- User onboarding challenges: complex dashboards can overwhelm new users, leading to steep learning curves and potential drop-offs.
- Support overhead: high volumes of support increase operational costs.

## Onboarding process

1. API documentation acquisition: clients provide comprehensive documentation of their endpoints of structured API reference the user can edit in their dashboard.
2. Initial setup: we collect and scrape the client's website to understand their business and create a customized agent with their inferred color palette to demonstrate immediate value.
3. Agent configuration: the Setup Agent analyzes the provided API documentation to automatically configure an AI agent for the client.
4. User interaction: end-users engage with the AI agent through a chat and voice interface, issuing commands in natural language.
5. Frontend integration: we provide a `<script>` snippet for clients to embed into their frontend dashboard. This script adds a widget with a chat/voice interface, allowing users to interact with the AI agent directly. Clients can style the widget to match their design by adding custom hex codes.
6. Secure API execution: optional sever to server token auth.
7. The widget will also run frontend code to interact with the dashboard directly.

## Technical architecture

- Dynamic tool mapping: each API endpoint is associated with a corresponding tool/function within the agent, facilitating direct backend interactions.
- Secure frontend communication: the embedded script ensures that API requests are executed within the user's authenticated session.
- Architecture diagram: 
<img width="847" height="295" alt="image" src="https://github.com/user-attachments/assets/c99dee09-9efc-4044-aac8-59c8e69dff50" />


### Technologies

Frontend: Vite, React, Typescript, pnpm, shadcdn, zustand, jest, tanstack/react query

- Widget `<script>`
- Dashboard

Backend: Python FastAPI, Langchain, Postgres/PGVector, SQLAlchemy, Redis, Python RQ, Pytest

Auth: Clerk

Infra: Docker, AWS ECR, ECS Fargate, Aurora DB

### Agents

- Setup Agent:
  - scrapes the provided website link to understand the business, extracts design elements (color palette, logo, etc.), and creates the initial Agent/Widget.
  - CRUD for structured API reference, Base URL, session info and endpoints.
- Main Agent
  - prompt → prompt Enhancer Agent → Get Endpoints Tool: Vector search to find which endpoints to use → select up to N endpoints, where N is a ratio from the total number of endpoints → Reranker → Add endpoints as Tools

Example:

prompt: i want you to generate me a list of the most funded Egyptian startups in the last 2 years then sequence all of them where the first stage is sending an email and the second stage is sending a LinkedIn message 2 days after the first stage.

prompt Enhancer Agent:

1. Search last 2 years egyptian startups
2. Create sequence with 2 stages, first stage email and 2nd stage Linkedin 2 days after.

endpoints:

1. POST Search
2. POST Sequence Stage
3. POST Sequence → errored: requires channels → requires endpoint to GET channels and set the channel ID in the POST Sequence endpoint → Calls Get Endpoints Tool to get and add New tools or replace them with the older tools.

- Agent can run JIT frontend code (start with a basic eval), a frontend_code tool call will return to the widget code to run on the frontend, that code must trigger the side effects of the component too by dispatching events, and not just editing the DOM.

## Future features

- Proactive assistance: develop features that allow the agent to anticipate user needs and offer suggestions or automate routine tasks.
- Continuous learning mechanism: implement machine learning algorithms that allow the agent to learn from user interactions, improving accuracy and relevance over time.
- Usage analytics: offer insights into user interactions with the agent, enabling clients to refine their services and identify potential upsell opportunities.
- Knowledge: scrape the provided website link to understand the business, discovers linked knowledge base sites (such as https://knowledge.amplemarket.com), ingests all articles.
- Agent features access control: toggle features on/off which maps to endpoints, or toggle specific endpoints on/off.

## Challenges

- Scalability: managing a large number of API endpoints may require dynamic loading of agent tools or implementing a system to handle endpoint prioritization.
- Security and compliance: ensuring secure handling of user data and maintaining compliance with industry standards is paramount, especially when bypassing traditional front-end security measures.
- User adoption: encouraging users to transition from traditional interfaces to an AI-driven interaction model will require intuitive design and demonstrable reliability.
- API reference must be clean: the document containing the API reference of the user must be very clean, most early stage businesses don’t have that, you will find in their codebase lots of enums passed as strings.
- API endpoints keeps getting changed and updated frequently.
- First in market: there are 0 products currently in market that do this, or do something similar, we will be the first, which would be very challenging in terms of explaining this product to possible users and difficult in sales and marketing.
- Computer Use / Operator: the whole point of this product is to help users skip complex UIs to get things done easily by chatting with a widget, Computer Use AI Systems such as Operator by OpenAI could do the exact same functionality by making the agent take control over the browser and navigating the complex UI and getting the task done for you, though today we are so far from this, due to these reason:
  - Though it requires chrome extension or user launching chrome with CDP, not doable via a script tag.

## Competitors

- https://usecrow.ai

## Go-to-market strategy

- Outbound and content creation on Linkedin.
- Target audience: small B2B SaaS companies with complex user interfaces seeking to enhance user engagement and reduce support overhead.
- Value proposition: offer a plug-and-play solution that seamlessly integrates with existing platforms, providing immediate improvements in user experience and operational efficiency.
- Sales stack:
  - LinkedIn
  - Amplemarket
  
## Valuable resources

- Kapa.ai offers a customizable widget for websites that answers technical documentation questions. Their onboarding process is similar—they ingest all your technical docs (API docs in our case). They also let you style the widget with custom hex codes to match your design. Companies like Docker, Reddit, Netlify, and OpenAI use it.
- https://www.youtube.com/watch?v=p7Iculwh7q8
- https://www.youtube.com/watch?v=KG4ONHqF1qg&list=WL&index=1
- https://www.youtube.com/watch?v=IypXvHej9eY&t=78s
