const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const axios = require('axios');
const spawn = require('await-spawn')

const core = require('@actions/core')
const toolcache = require('@actions/tool-cache')
const io = require('@actions/io')
const releases = require('@hashicorp/js-releases');
const { stdout } = require('process');

(async () => { try {

    const hostname = core.getInput('scalr_hostname', { required: true })
    const token = core.getInput('scalr_token', { required: true })
    const workspace = core.getInput('scalr_workspace')
    let cli_version = core.getInput('scalr_cli_version')
    let version = core.getInput('terraform_version')
    const wrapper = core.getInput('terraform_wrapper') === 'true';
    const output = core.getInput('terraform_output')

    const platform = {'win32':'windows'}[os.platform()] || os.platform()
    const arch = {'x32':'386', 'x64':'amd64'}[os.arch()] || os.arch()

    if (!cli_version) {
        core.info('Fetch latest version of Scalr CLI')
        let latest = await axios.head('https://github.com/scalr/scalr-cli/releases/latest')    
        cli_version = new URL(latest.request.res.responseUrl).pathname.split('/').pop();
    }
    cli_version = cli_version.replace('v', '');
    let url = `https://github.com/Scalr/scalr-cli/releases/download/v${cli_version}/scalr-cli_${cli_version}_${platform}_${arch}.zip`

    core.info(`Downloading compressed Scalr CLI binary from ${url}`)
    const zip2 = await toolcache.downloadTool(url)
    if (!zip2) throw new Error('Failed to download Scalr CLI')

    core.info('Decompressing Scalr CLI binary')
    const cli2 = await toolcache.extractZip(zip2);
    if (!cli2) throw new Error('Failed to decompress Scalr CLI')

    core.info('Add Scalr CLI to PATH')
    core.addPath(cli2)

    let conf = `${process.env.HOME}/.scalr/scalr.conf`
    core.info(`Generating Scalr CLI credentials file at ${conf}`)
    await io.mkdirP(path.dirname(conf))
    await fs.writeFile(conf, `{ \"hostname\": \"${hostname}\", \"token\": \"${token}\" }`)

    if (!version) {
        core.info('No Terraform version specified. Will try to autodetect using Scalr CLI.')
        if (!workspace) throw new Error('Please specify workspace to autodetect Terraform version')

        let data
        try {
            core.info(`Fetching Terraform version for workspace ${workspace}`)
            data = await spawn('scalr', ['get-workspace', '-workspace='+workspace])
            
            data = JSON.parse(data.toString())

            version = data['terraform-version']

        } catch (e) {
            throw new Error('Unable to find specified workspace')
        }
    }

    core.info(`Preparing to download Terraform version ${version}`)
    const release = await releases.getRelease('terraform', version);
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

    core.exportVariable('TF_IN_AUTOMATION', 'TRUE');
    core.exportVariable('TERRAFORM_OUTPUT', output);

} catch(error) {
    core.setFailed(error.message)
} })();
