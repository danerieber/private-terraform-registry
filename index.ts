import { exists, mkdir, readdir } from "fs/promises";
import {
  RequestLike,
  Router,
  error,
  json,
  status,
  withParams,
} from "itty-router";
import path from "path";

const rootDir = path.join(import.meta.dir, "store");
const modulesDir = path.join(rootDir, "modules");

function getModuleDir(namespace: string, name: string, system: string) {
  return path.join(modulesDir, namespace, name, system);
}

function getModuleFile(
  namespace: string,
  name: string,
  system: string,
  version: string
) {
  return path.join(getModuleDir(namespace, name, system), `${version}.zip`);
}

const router = Router();
router
  .all("*", withParams)
  .get("/.well-known/terraform.json", (request) => ({
    "modules.v1": new URL("/v1/modules/", request.url).toString(),
  }))
  .get(
    "/v1/modules/:namespace/:name/:system/versions",
    async ({ namespace, name, system }) => {
      const dir = getModuleDir(namespace, name, system);
      if (!(await exists(dir))) {
        return error(404);
      }
      const files = await readdir(dir);
      return {
        modules: [
          {
            versions: files.map((file) => ({
              version: file.slice(0, -4),
            })),
          },
        ],
      };
    }
  )
  .get(
    "/v1/modules/:namespace/:name/:system/:version/download",
    async ({ namespace, name, system, version, url }) => {
      const file = getModuleFile(namespace, name, system, version);
      if (!(await exists(file))) {
        return error(404);
      }
      return status(204, {
        headers: {
          "X-Terraform-Get": new URL(
            `/v1/modules/${namespace}/${name}/${system}/${version}/file.zip`,
            url
          ).toString(),
        },
      });
    }
  )
  .get(
    "/v1/modules/:namespace/:name/:system/:version/file.zip",
    async ({ namespace, name, system, version }) => {
      const file = getModuleFile(namespace, name, system, version);
      if (!(await exists(file))) {
        return error(404);
      }
      return new Response(Bun.file(file));
    }
  )
  .post(
    "/v1/modules/:namespace/:name/:system/:version/upload",
    async ({ namespace, name, system, version, blob }) => {
      const dir = getModuleDir(namespace, name, system);
      if (!(await exists(dir))) {
        await mkdir(dir, { recursive: true });
      }
      const file = getModuleFile(namespace, name, system, version);
      if (await exists(file)) {
        return error(
          400,
          `Version ${version} already exists! Please update the version number.`
        );
      }
      const data = await blob();
      if (!data) {
        return error(
          400,
          "No data received. Please include your module archive as the request body."
        );
      }
      await Bun.write(file, data);
      return "Success!";
    }
  )
  .all("*", () => error(404));

export default {
  port: 3001,
  fetch: (request: RequestLike) =>
    router.handle(request).then(json).catch(error),
};
