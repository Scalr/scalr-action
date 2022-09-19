#!/usr/bin/env node

const core = require('@actions/core');
const cp = require('child_process');

let stderr = ''
let stdout = ''

const child = cp.spawn('terraform-bin', process.argv.slice(2))

child.on('exit', function (code, signal) {
    core.setOutput('stdout', stdout)
    core.setOutput('stderr', stderr)
    core.setOutput('exitcode', code)

    if (code || !JSON.parse(process.env.TERRAFORM_OUTPUT.toLowerCase()) || (process.argv[2] != 'apply' && process.argv[3] != 'apply')) process.exit(code);

    //Run a terraform output to catch outputs
    cp.exec('terraform-bin output -json', (error2, stdout2, stderr2) => {
        if (error2) return;
        
        let data = JSON.parse(stdout2)

        for (var prop in data) {
            core.setOutput(prop, data[prop].value)
        }

        process.exit(0)
    });
});

child.on('error', function () {
    core.setFailed('Unable to find terraform-bin in PATH')
});

child.stdout.on('data', (data) => {
    console.log(data.toString().trim())
    stdout += data
});
  
child.stderr.on('data', (data) => {
    console.log(data.toString().trim())
    stderr += data    
});

