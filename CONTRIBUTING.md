# How to contribute to the Scalr Github Action
## Basic steps
Here are the basic steps to make a change and contribute it back to the project.

1. [Fork](https://docs.github.com/en/get-started/quickstart/fork-a-repo) the [Scalr/scalr-action](https://github.com/Scalr/scalr-action) repo.
2. Make the changes and commit to your fork.
3. Create a [pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests).

## Development environment

We recommend using [VS Studio Code](https://code.visualstudio.com/) to edit the code. As the Scalr Github Action is written in [NodeJS](https://nodejs.org/), you will need to install Node somewhere in your PATH.

After you made you changes and committed back to github, you should run the Github Action called "Build dist files and release". You will be able to pick what version you want
to release.

This will build and create a release that can be used for testing. To test, simply use the Action like you normally would, but change the "uses"-part to point at your own repo:

```yaml
steps:
- uses: your-github-username/your-github-repo@your-version
```

## Rules

We try to make it as easy and painless as possible to contribute back to the project. However, some minimal rules must be followed to keep the project in good shape and maintain quality.

1. Please sign the [CLA](https://github.com/Scalr/scalr-action/blob/master/Contribution_Agreement.md) and send it to support@scalr.com. This is required before we can merge any PRs.

2. Each pull request should contain only **one** bugfix/feature. If you want to add several features, please make individual pull requests for each one. Putting lots of changes in one single PR will make it harder for the maintainers to approve it, as **all** new changes will need to be tested and approved as a whole. Splitting it into individual requests makes it possible to approve some, while others can be pushed back for additional work.

3. Make sure that each commit has a **clear** and **complete** title and description on what has been fixed/changed/updated/added. As this will be used for building the release changelog, it's important that it's accurate and explains to the users what updating to this version will entail. Changes that breaks backwards compatibility is discouraged and needs a very strong reason to be approved.
