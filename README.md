# scalr-action

The Scalr GitHub Action is used to automate Terraform and OpenTofu runs within Scalr, a cost-effective, drop-in replacement for Terraform Cloud with feature parity and better GitOps support. This action allows you to trigger and manage Terraform plans and applies, streamline CI/CD pipelines, and integrate infrastructure automation directly into your GitHub workflows.

The `scalr-action` is written in JavaScript that sets up the Scalr and OpenTofu/Terraform CLI. The action does the following:

- Downloads (and caching) the latest version of [Scalr CLI](https://github.com/Scalr/scalr-cli) and adds it to the `PATH`.
- Downloads (and caching) a specific (or autodetected) version of OpenTofu/Terraform CLI and adds it to the `PATH`.
- Configures the Scalr CLI and [Terraform CLI configuration file](https://www.terraform.io/docs/commands/cli-config.html) with a Scalr Hostname and Token.
- Optionally: Installs a script to wrap following calls of the `tofu/terraform` binary. Exposes the STDOUT, STDERR, and exit code as outputs named `stdout`, `stderr`, and `exitcode`. Enabled by default
- Optionally: [Terraform output variables](https://www.terraform.io/language/values/outputs) will be cached and converted to action variables. This is disabled by default.

After the action has been used, the following steps in the job can run the standard Opentofu/Terraform commands using [the GitHub Actions `run` command](https://help.github.com/en/actions/reference/workflow-syntax-for-github-actions#jobsjob_idstepsrun).

You will also have access to the Scalr CLI which communicates directly with the Scalr API and allows you to perform Scalr specific tasks, such as creating users, pull statistics, etc.

## Usage

Supported on the following GitHub Actions runners\:

- `ubuntu-latest`
- `windows-latest` (be sure to set the shell to Bash)
- `macos-latest`

If manually specifying an OpenTofu/Terraform version, provide a concrete version and make sure it matches the version you expect to use.
To autodetect the version from Scalr, leave `binary_version` empty and set `scalr_workspace`.
As an alternative to `scalr_workspace`, you can provide both `scalr_environment_name` and `scalr_workspace_name` to resolve the workspace ID by name.
Values such as `auto` and `latest` are not valid explicit `binary_version` values.
You also need to generate a [Scalr API Token](https://docs.scalr.io/docs/creating-a-workspace-1#cli--workspace) and store it as a [GitHub Secret](https://docs.github.com/en/actions/security-guides/encrypted-secrets).

The following steps can access OpenTofu/Terraform outputs:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: Scalr/scalr-action@v1
    with:
      scalr_hostname: "<your-account>.scalr.io"
      scalr_token: ${{ secrets.SCALR_TOKEN }}
      scalr_environment_name: production
      scalr_workspace_name: network
      iac_platform: tofu
      binary_output: true

  - run: tofu init

  - id: plan
    run: tofu plan

  - run: echo "${{ steps.plan.outputs.stdout }}"
  - run: echo "${{ steps.plan.outputs.stderr }}"
  - run: echo "${{ steps.plan.outputs.exitcode }}"

  - id: apply
    run: tofu apply -auto-approve

  - run: echo ${{ steps.apply.outputs.server_ip }}
```

## OpenTofu/Terraform configuration

Make sure your OpenTofu/Terraform configuration includes the minimal parameters for Scalr.
Here is an example for a minimal `main.tf`:

```
terraform {
  backend "remote" {
    hostname = "example.scalr.io"
    organization = "env-abcdef123456"

    workspaces {
      name = "helloworld"
    }
  }
}
```

## Inputs

The action supports the following inputs:

- `scalr_hostname` - The hostname of your Scalr account on scalr.io. Example: `example.scalr.io`.

- `scalr_token` - The API token used to authenticate with the credentials block of the Terraform CLI config file.

- `scalr_workspace` - The Scalr workspace ID you plan on working in. This is required if you want to autodetect the OpenTofu/Terraform version.

- `scalr_workspace_name` - The Scalr workspace name to resolve before the action runs. Must be used together with `scalr_environment_name`.

- `scalr_environment_name` - The Scalr environment name that contains `scalr_workspace_name`. Must be used together with `scalr_workspace_name`.

- `iac_platform` - Specifies if you want to use the `tofu` or `terraform` platform. Default is `terraform`.

- `binary_version` - The concrete version of OpenTofu/Terraform CLI to install. Leave it empty and set `scalr_workspace` to autodetect from Scalr. Do not set it to `auto` or `latest`.

Do not set `scalr_workspace` together with `scalr_workspace_name` or `scalr_environment_name`. Use either the workspace ID or the name-based pair.

- `binary_wrapper` - Whether or not to install a wrapper to wrap calls of the `tofu/terraform` binary and expose its STDOUT, STDERR, and exit code

- `binary_output` - true/false. Export OpenTofu/Terraform output variables as Action output variables. The OpenTofu/Terraform wrapper needs to be enabled for this to work. Example: `steps.<step-name>.outputs.<terraform_output_name>` This is disabled by default.

## Outputs

The following outputs are available for further steps that call the `tofu/terraform` binary if the wrapper has not been set to false.

- `stdout` - The STDOUT of the call to the `tofu/terraform` binary.

- `stderr` - The STDERR of the call to the `tofu/terraform` binary.

- `exitcode` - The exit code of the call to the `tofu/terraform` binary.

- `<terraform_output_var_name>` - Stores the Terraform output variables from last `tofu/terraform apply` run if binary_output=true

## Scalr CLI

More information about how to use the Scalr CLI provided by this Action, please refer to the [Scalr CLI repository](https://github.com/Scalr/scalr-cli).

## Development

This repository uses [Bun](https://bun.sh/) as the primary package manager.

```bash
bun install
bun run test
bun run build
```

## Contributing

To contribute to this project, please see the [contribution guidelines](https://github.com/Scalr/scalr-action/blob/master/CONTRIBUTING.md). Also please fill out the [Contribution Agreement](https://github.com/Scalr/scalr-action/blob/master/Contribution_Agreement.md) and send it to support@scalr.com
