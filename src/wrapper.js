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

    process.exit(code);
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

