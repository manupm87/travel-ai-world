---
description: Automated workflow for task start and finish, integrating with Linear and GitHub.
---

// turbo-all

# Task Lifecycle Workflow

This workflow automates the process of starting a new task (creating branches, updating Linear) and finishing it (creating PRs, updating Linear).

## /start-task

Run this command at the beginning of any new task to set up your environment.

1. **Search for or create a Linear issue**
   - Use `mcp_linear-mcp-server_list_issues` with a query based on the current task goal.
   - If no relevant issue is found, use `mcp_linear-mcp-server_save_issue` to create one in the "Travel AI World" team with state "Todo".
   - Store the issue ID (e.g., `TRA-123`).

2. **Move issue to "In Progress"**
   - Use `mcp_linear-mcp-server_save_issue` with the issue ID and set `state` to "In Progress".

3. **Create a new git branch**
   - Generate a branch name based on the issue title (e.g., `feat/TRA-123-description`).
   - Run `git checkout -b <branch-name>`.

## /finish-task

Run this command when the task implementation and verification are complete.

1. **Push changes**
   - Run `git push origin HEAD`.

2. **Create a GitHub Pull Request**
   - Use `mcp_github-mcp-server_create_pull_request` with:
     - `owner`: "manupm87" (or use `mcp_github-mcp-server_get_me` to find)
     - `repo`: "travel-ai-world"
     - `title`: The title of the Linear issue.
     - `body`: `Closes <Issue ID>` (e.g., `Closes TRA-123`).
     - `head`: The current branch name.
     - `base`: "main"

3. **Summarize completion**
   - Update the user that the PR is created and the Linear ticket is updated.