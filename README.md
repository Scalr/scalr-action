# scalr-action

The `scalr-action` action is a JavaScript action that sets up Scalr CLI and Terraform CLI in your GitHub Actions workflow by:

- Downloading (and caching) the latest version of Scalr CLI and adding it to the `PATH`.
- Downloading (and caching) a specific version of Terraform CLI and adding it to the `PATH`.
- Configuring the Scalr CLI and [Terraform CLI configuration file](https://www.terraform.io/docs/commands/cli-config.html) with a Scalr Hostname and API Token.
- Optionally: Installing a wrapper script to wrap subsequent calls of the `terraform` binary and expose its STDOUT, STDERR, and exit code as outputs named `stdout`, `stderr`, and `exitcode` respectively. This is enabled by default.
- Optionally: [Terraform output variables](https://www.terraform.io/language/values/outputs) will be catched and converted to Action variables. This is disabled by default.

After you've used the action, subsequent steps in the same job can run arbitrary Terraform commands using [the GitHub Actions `run` syntax](https://help.github.com/en/actions/reference/workflow-syntax-for-github-actions#jobsjob_idstepsrun). This allows most Terraform commands to work exactly like they do on your local command line.

You will also have access to the Scalr CLI which communicates directly with the Scalr API and allows you to perform Scalr specific tasks, such as creating users, pull statistics etc.

## Usage

This action can be run on `ubuntu-latest`, `windows-latest`, and `macos-latest` GitHub Actions runners. When running on `windows-latest` the shell should be set to Bash.

Please remember to set the same terraform version as set in your Scalr Workspace. 
You also need to generate a [Scalr API Token](https://docs.scalr.com/en/latest/migration.html) and store it as a [GitHub Secret](https://docs.github.com/en/actions/security-guides/encrypted-secrets).

Subsequent steps can access Terraform outputs, if the optional wrapper is enabled.

```yaml
steps:
- uses: Scalr/scalr-action@v1
  with:
    scalr_hostname: 'example.scalr.io'
    scalr_token: ${{ secrets.SCALR_TOKEN }}
    terraform_version: 1.2.0
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
    organization = "env-tq8cgtfobaj07u8"

    workspaces {
      name = "helloworld"
    }
  }
}
```

## Inputs

The action supports the following inputs:

- `scalr_hostname` - The hostname of a Scalr instance to 
   place within the credentials block of the Terraform CLI configuration file. Example: `example.scalr.io`.

- `scalr_token` - The API token for a Scalr instance to
   place within the credentials block of the Terraform CLI configuration file.

- `terraform_version` - The version of Terraform CLI to install. Please use the same version as set in your Scalr Workspace.

- `terraform_wrapper` - Whether or not to install a wrapper to wrap subsequent calls of the `terraform` binary and expose its STDOUT, STDERR, and exit code as outputs named `stdout`, `stderr`, and `exitcode` respectively. This is enabled by default.

- `terraform_output` - true/false. Export Terraform output variables as Action output variables. The Terraform wrapper needs to be enabled for this to work. Example: `steps.<step-name>.outputs.<terraform_output_name>` This is disabled by default.

## Outputs

This action does not configure any outputs directly. However, the following outputs are available for subsequent steps that call the `terraform` binary, given that terraform_wrapper has not been set to false.

- `stdout` - The STDOUT stream of the call to the `terraform` binary.

- `stderr` - The STDERR stream of the call to the `terraform` binary.

- `exitcode` - The exit code of the call to the `terraform` binary.

- `<terraform_output_var_name>` - Stores the Terraform output variables from last `terraform apply` run if terraform_output=true

## Scalr CLI

More information about how to use the Scalr CLI provided by this Action, please refer to the [Scalr CLI repository](https://github.com/Scalr/scalr-cli).
