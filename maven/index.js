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
    }
}

async function handleRequest(request) {
    const url = new URL(request.url);
    const key = url.pathname.slice(1);
    const kvKey = url.pathname;

    if (!authorizeRequest(request, key)) {
        return new Response('Forbidden', {status: 403});
    }

    switch (request.method) {
        case "PUT":
            await MAVEN_BUCKET.put(key, request.body);

            await MAVEN_KV.put(kvKey, stringify({type: "file"}));
            const pathList = key.split("/");
            let path = url.origin + "/";

            for (const _id in pathList) {
                const id = parseInt(_id);
                if (pathList[id + 1]) {
                    const list = (await MAVEN_KV.get(kvKey, {type: "json"})).content;
                    if (list && !list.includes(pathList[id + 1])) {
                        list.push(pathList[id + 1]);
                        await MAVEN_KV.put(kvKey, stringify({type: "list", content: list}), {expirationTtl: "604800"});
                    }
                    path += pathList[id] + "/";
                }
            }

            return new Response(`Put ${key} successfully!`);

        case "HEAD":
        case "GET":
            const cached = await MAVEN_KV.get(kvKey, {type: "json"});

            if (!cached) {
                const object = await MAVEN_BUCKET.get(key);

                if (!object && !key.endsWith("/") && key) {
                    await MAVEN_KV.put(kvKey, stringify({type: "empty"}), {expirationTtl: "60"});
                    return error("Object Not Found", 404);
                }

                if (!object) {
                    const list = await MAVEN_BUCKET.list({prefix: key, delimiter: "/"});
                    const paths = list.delimitedPrefixes;
                    const files = list.objects;

                    if (paths.length === 0 && files.length === 0) {
                        await MAVEN_KV.put(kvKey, stringify({type: "empty"}), {expirationTtl: "60"});
                        return error("Object Not Found", 404);
                    }

                    const finalList = [];

                    for (const path in paths) {
                        finalList.push(paths[path].replace(key, ""));
                    }

                    for (const file in files) {
                        finalList.push(files[file].key.replace(key, ""));
                    }

                    const json = {type: "list", content: finalList};
                    await MAVEN_KV.put(kvKey, stringify(json), {expirationTtl: "604800"});
                    return jsonRes(json);
                }

                await MAVEN_KV.put(kvKey, stringify({type: "file"}));
                return new Response(object.body, {
                    headers: {
                        "Cache-Control": "max-age 86400"
                    }
                });

            } else {
                switch (cached.type) {
                    case "file":
                        const object = await MAVEN_BUCKET.get(key);
                        if (!object) {
                            await MAVEN_KV.put(kvKey, stringify({type: "empty"}), {expirationTtl: "60"});
                            return error("Object Not Found", 404);
                        }

                        return new Response(object.body, {
                            headers: {
                                "Cache-Control": "max-age 86400"
                            }
                        });

                    case "list":
                        return jsonRes(cached);
                    case "empty":
                        return error("Object Not Found", 404);
                }
            }
            return error("Object Not Found", 404);

        default:
            return new Response("Method Not Allowed", {status: 405});
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
