# scalr-action

The `scalr-action` action is an action written in JavaScript that sets up the Scalr and Terraform CLI. The action does the following:

- Downloads (and caching) the latest version of [Scalr CLI](https://github.com/Scalr/scalr-cli) and adds it to the `PATH`.
- Dowloads (and caching) a specific (or autodetected) version of Terraform CLI and adds it to the `PATH`.
- Configures the Scalr CLI and [Terraform CLI configuration file](https://www.terraform.io/docs/commands/cli-config.html) with a Scalr Hostname and Token.
- Optionally: Installs a script to wrap following calls of the `terraform` binary. Exposes the STDOUT, STDERR, and exit code as outputs named `stdout`, `stderr`, and `exitcode`. Enabled by default
- Optionally: [Terraform output variables](https://www.terraform.io/language/values/outputs) will be cached and converted to action variables. This is disabled by default.

After the action has been used, the following steps in the job can run the standard Terraform commands using [the GitHub Actions `run` command](https://help.github.com/en/actions/reference/workflow-syntax-for-github-actions#jobsjob_idstepsrun).

You will also have access to the Scalr CLI which communicates directly with the Scalr API and allows you to perform Scalr specific tasks, such as creating users, pull statistics, etc.

## Usage

Supported on the following GitHub Actions runners\:
* `ubuntu-latest`
* `windows-latest` (be sure to set the shell to Bash)
* `macos-latest` 

If manually specifying a Terraform version, please remember to set the same version as set in your Scalr Workspace. 
You also need to generate a [Scalr API Token](https://docs.scalr.io/docs/creating-a-workspace-1#cli--workspace) and store it as a [GitHub Secret](https://docs.github.com/en/actions/security-guides/encrypted-secrets).

The following steps can access Terraform outputs:

```yaml
steps:
- uses: Scalr/scalr-action@v1
  with:
    scalr_hostname: '<your-account>.scalr.io'
    scalr_token: ${{ secrets.SCALR_TOKEN }}
    scalr_workspace: ws-abcdef123456
    terraform_output: true

- run: terraform init

- id: plan
  run: terraform plan

- run: echo "${{ steps.plan.outputs.stdout }}"
- run: echo "${{ steps.plan.outputs.stderr }}"
- run: echo "${{ steps.plan.outputs.exitcode }}"

- id: apply
  run: terraform apply -auto-approve

- run: echo ${{ steps.apply.outputs.server_ip }}
```

## Terraform configuration

Make sure your Terraform configuration includes the minimal parameters for Scalr. 
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

- `scalr_workspace` - The Scalr workspace ID you plan on working in. This is required if you want to auto-detect Terraform version.

- `terraform_version` - The version of Terraform CLI. This must match the version set in your Scalr Workspace. It will be autodetected if left empty and workspace is set.

- `terraform_wrapper` - Whether or not to install a wrapper to wrap calls of the `terraform` binary and expose its STDOUT, STDERR, and exit code

- `terraform_output` - true/false. Export Terraform output variables as Action output variables. The Terraform wrapper needs to be enabled for this to work. Example: `steps.<step-name>.outputs.<terraform_output_name>` This is disabled by default.

## Outputs

The following outputs are available for further steps that call the `terraform` binary if the wrapper has not been set to false.

- `stdout` - The STDOUT of the call to the `terraform` binary.

- `stderr` - The STDERR of the call to the `terraform` binary.

- `exitcode` - The exit code of the call to the `terraform` binary.

- `<terraform_output_var_name>` - Stores the Terraform output variables from last `terraform apply` run if terraform_output=true

## Scalr CLI

More information about how to use the Scalr CLI provided by this Action, please refer to the [Scalr CLI repository](https://github.com/Scalr/scalr-cli).

## Contributing

To contribute to this project, please see the [contribution guidelines](https://github.com/Scalr/scalr-action/blob/master/CONTRIBUTING.md). Also please fill out the [Contribution Agreement](https://github.com/Scalr/scalr-action/blob/master/Contribution_Agreement.md) and send it to support@scalr.com
