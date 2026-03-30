function buildTerraformDownloadUrl(version, platform, arch) {
  return `https://releases.hashicorp.com/terraform/${version}/terraform_${version}_${platform}_${arch}.zip`;
}

function buildOpenTofuDownloadUrl(version, platform, arch) {
  return `https://github.com/opentofu/opentofu/releases/download/v${version}/tofu_${version}_${platform}_${arch}.zip`;
}

function buildScalrCliDownloadUrl(version, platform, arch) {
  return `https://github.com/Scalr/scalr-cli/releases/download/v${version}/scalr-cli_${version}_${platform}_${arch}.zip`;
}

module.exports = {
  buildOpenTofuDownloadUrl,
  buildScalrCliDownloadUrl,
  buildTerraformDownloadUrl,
};
