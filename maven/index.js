const defaultHeaders = {
    headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    }
}

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
})

function hasValidHeader(request) {
  return request.headers.get('X-Custom-Auth-Key') === AUTH_KEY_SECRET;
}

function authorizeRequest(request, key) {
  switch (request.method) {
    case 'PUT':
      return hasValidHeader(request);
    case 'GET':
      return true;
    default:
      return false;
  }
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const key = url.pathname.slice(1);
  const cacheKey = request.url;
  let cache = caches.default;

  if (!authorizeRequest(request, key)) {
    return new Response('Forbidden', { status: 403 });
  }

  switch (request.method) {
    case "PUT":
      await MAVEN_BUCKET.put(key, request.body);

      await cache.put(cacheKey, jsonRes({type: "file"}));
      const pathList = url.pathname.split("/");
      const path = url.origin + "/";

      for (const _id in pathList) {
        const id = parseInt(_id);
        if (pathList[id + 1]) {
          const list = (await (await cache.match(path)).json()).content;
          if (list && !list.includes(pathList[id + 1])) {
            list.push(pathList[id + 1]);
            await cache.put(cacheKey, jsonRes({type: "list", content: list}));
          }
          path += pathList[id] + "/";
        }
      }
      
      return new Response(`Put ${key} successfully!`);

    case "GET":
      const cached = await cache.match(cacheKey);

      if (!cached) {
        const object = await MAVEN_BUCKET.get(key);

        if (!object && !key.endsWith("/") && key) {
          return error("Object Not Found", 404);
        }

        if (!object) {
          const list = await MAVEN_BUCKET.list({prefix: key, delimiter: "/"});
          const paths = list.delimitedPrefixes;
          const files = list.objects;

          if (paths.length === 0 && (files && files.length === 0)) {
            return error("Object Not Found", 404);
          }

          const finalList = paths;
          
          for (const file in files) {
            finalList.push(files[file].key);
          }

          const res = jsonRes({type: "list", content: finalList});
          await cache.put(cacheKey, res.clone());
          return res;
        }

        await cache.put(cacheKey, jsonRes({type: "file"}));
        return new Response(object.body, { 
          headers: {
            "Cache-Control": "max-age 86400"
          } 
        });

      } else {
        const cacheData = await cached.clone().json();
        if (cacheData.type == "file") {
          const object = await MAVEN_BUCKET.get(key);

          if (!object) {
            return error("Object Not Found", 404);
          }

          return new Response(object.body, { 
            headers: {
              "Cache-Control": "max-age 86400"
            } 
          });
          
        } else if (cacheData.type == "list") {
          return cached;
        }
      }
      
    default:
      return new Response("Method Not Allowed", { status: 405 });
  }
}

/* =================
 *     UTIL CODE
 * ================= */
function stringify(json) {
  return JSON.stringify(json);
}

function errorJson(message, code, data) {
  return {"error": {"message": message, "data": data, "code": code}}
}

function errorStr(message, code, data) {
  return stringify(errorJson(message, code, data))
}

function error(message, code, data) {
  return new Response(errorStr(message, code, data), 
    {status: code, headers: defaultHeaders.headers});
}

function jsonRes(json) {
    return new Response(stringify(json), defaultHeaders);
}
