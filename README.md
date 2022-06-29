# scalr-terraform-cli

The `scalr-terraform-cli` action is a JavaScript action that sets up Terraform CLI in your GitHub Actions workflow by:

- Downloading (and caching) a specific version of Terraform CLI and adding it to the `PATH`.
- Configuring the [Terraform CLI configuration file](https://www.terraform.io/docs/commands/cli-config.html) with a Scalr Hostname and API Token.
- Installing a wrapper script to wrap subsequent calls of the `terraform` binary and expose its STDOUT, STDERR, and exit code as outputs named `stdout`, `stderr`, and `exitcode` respectively.

After you've used the action, subsequent steps in the same job can run arbitrary Terraform commands using [the GitHub Actions `run` syntax](https://help.github.com/en/actions/reference/workflow-syntax-for-github-actions#jobsjob_idstepsrun). This allows most Terraform commands to work exactly like they do on your local command line.

## Usage

This action can be run on `ubuntu-latest`, `windows-latest`, and `macos-latest` GitHub Actions runners. When running on `windows-latest` the shell should be set to Bash.

Please remember to set the same terraform version as set in your Scalr Workspace. 
You also need to generate a [Scalr API Token](https://docs.scalr.com/en/latest/migration.html) and store it as a [GitHub Secret](https://docs.github.com/en/actions/security-guides/encrypted-secrets).

Subsequent steps can access Terraform outputs.

```yaml
steps:
- uses: buzzy/scalr-terraform-cli@v1
  with:
    scalr_hostname: 'example.scalr.io'
    scalr_token: ${{ secrets.SCALR_TOKEN }}
    terraform_version: 1.2.0

- run: terraform init

- id: plan
  run: terraform plan

- run: echo ${{ steps.plan.outputs.stdout }}
- run: echo ${{ steps.plan.outputs.stderr }}
- run: echo ${{ steps.plan.outputs.exitcode }}  
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

## Outputs

This action does not configure any outputs directly. However, the following outputs are available for subsequent steps that call the `terraform` binary.

- `stdout` - The STDOUT stream of the call to the `terraform` binary.

- `stderr` - The STDERR stream of the call to the `terraform` binary.

- `exitcode` - The exit code of the call to the `terraform` binary.