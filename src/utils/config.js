const targetEnv = process.env.TARGET_ENV;

const releaseBuild = process.env.RELEASE_BUILD === true;


const storageRevisions = {
  local: process.env.STORAGE_REVISION_LOCAL,
  session: process.env.STORAGE_REVISION_SESSION
};

const appVersion = process.env.APP_VERSION;

const mv3 = process.env.MV3 === 'true';

export {
  targetEnv,
  releaseBuild,
  storageRevisions,
  appVersion,
  mv3
};
