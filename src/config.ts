import nconf from 'nconf';
import { homedir } from 'os';
import path from 'path';
import { StandardSchemaV1 } from '@standard-schema/spec';

async function discoverGitRoot() {
  return await Bun.$`git rev-parse --show-toplevel`.text();
}

export async function createConfigService<Schema extends StandardSchemaV1>(
  name: string,
  schema: Schema,
  options?: { defaults?: StandardSchemaV1.InferOutput<Schema> }
) {
  const appname = 'pi-footer';
  const envprefix = appname.toUpperCase().replace(/-/g, '_') + '_';

  // Env
  nconf.env({
    separator: '__',
    match: new RegExp(`^${envprefix}`),
  });

  // Files
  // The main config file is stored in the user's home directory under .pi/agent/pi-footer.json
  nconf.file({
    file: path.join(homedir(), '.pi', 'agent', `${appname}.config.json`),
  });

  const root = await discoverGitRoot();
  // The local config file is stored in the current working directory under .pi/pi-footer.json
  nconf.file({
    file: path.join(root || process.cwd(), '.pi', `${appname}.config.json`),
  });

  // Defaults
  nconf.defaults(options?.defaults || {});

  /*
   * Reload values from env + config file and return the normalized config snapshot.
   */
  nconf.load();

  const config = schema['~standard'].validate(nconf.get());

  return config;
}
