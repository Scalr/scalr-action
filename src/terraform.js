const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const core = require('@actions/core')
const toolcache = require('@actions/tool-cache')
const io = require('@actions/io')
const releases = require('@hashicorp/js-releases');
const { stdout } = require('process');

(async () => { try {

    const hostname = core.getInput('scalr_hostname', { required: true })
    const token = core.getInput('scalr_token', { required: true })
    const version = core.getInput('terraform_version', { required: true })
    const wrapper = core.getInput('terraform_wrapper') === 'true';

    core.info(`Preparing to download Terraform version ${version}`)
    const release = await releases.getRelease('terraform', version);
    const platform = {'win32':'windows'}[os.platform()] || os.platform()
    const arch = {'x32':'386', 'x64':'amd64'}[os.arch()] || os.arch()
    const build = release.getBuild(platform, arch);
    if (!build) throw new Error('No matching version found');

    core.info(`Downloading compressed Terraform binary from ${build.url}`)
    const zip = await toolcache.downloadTool(build.url)
    if (!zip) throw new Error('Failed to download Terraform')

    core.info('Decompressing Terraform binary')
    const cli = await toolcache.extractZip(zip);
    if (!cli) throw new Error('Failed to decompress Terraform')

    core.info('Add Terraform to PATH')
    core.addPath(cli)

    if (wrapper) {
        core.info('Rename Terraform binary to make way for the wrapper')
        const exeSuffix = os.platform().startsWith('win') ? '.exe' : ''
        let source = [cli, `terraform${exeSuffix}`].join(path.sep)
        let target = [cli, `terraform-bin${exeSuffix}`].join(path.sep)
        await io.mv(source, target)

        core.info('Install wrapper to forward Terraform output to future actions')
        source = path.resolve([__dirname, '..', 'wrapper', 'index.js'].join(path.sep));
        target = [cli, 'terraform'].join(path.sep);
        await io.cp(source, target);
    }

    let rc = process.env.TF_CLI_CONFIG_FILE
    if (!rc) rc = (platform == 'windows') ? `${process.env.APPDATA}/terraform.rc` : `${process.env.HOME}/.terraformrc`
    core.info(`Generating Terraform credentials file at ${rc}`)
    await io.mkdirP(path.dirname(rc))
    await fs.writeFile(rc, `credentials \"${hostname}\" {\n  token = \"${token}\"\n}`)

} catch(error) {
    core.setFailed(error.message)
} })();