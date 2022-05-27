/* ==================
 *     CORE CODE
 * ================== */
const defaultHeaders = {
    headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    }
}

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
    try {
        if (request.method !== "GET") return validateMethod(request);

        const { pathname, searchParams } = new URL(request.url);
        const search = Object.fromEntries(searchParams.entries());
        const path = pathname === "/" ? [] : pathname.replace("/", "").split("/");
        const queryValidation = validateQuery(search);
        if (queryValidation instanceof Response) return queryValidation;

        if (path[0] !== "v1") return error("Invalid GET request", 400);

        if (path[1] === "crowdin" && search.project) {
            return crowdin(request, path, search);
        }

        return error("Invalid GET request", 400);
    } catch (e) {
        if (e.message === "Invalid URL string.")  {
            return error(e.message, 400);
        }
        return error("Internal server error", 500);
    }
}

/* ==================
 *     API CODE
 * ================== */
async function crowdin(request, path, search) {
    const headers = {
        headers: {
            'Authorization': `Bearer ${LOL_NO}`,
            'Content-Type': 'application/json'
        }
    };
    
    switch (path[2]) {
        case "translation-status": {
          const url = `https://api.crowdin.com/api/v2\
          /projects/${search.project}/languages/progress?limit=500`
          .replace(/[ ]+/g, "");

          const res = await (await fetch(url, headers)).json();
          if (res.error) return error("Unable to get project data!", 500);
          return response(res.data);
          break;
        }

        case "languages": {
          const url = `https://api.crowdin.com/api/v2\
          /projects/${search.project}`
          .replace(/[ ]+/g, "");

          const res = await (await fetch(url, headers)).json();
          if (res.error) return error("Unable to get project data!", 500);
          return response(res.data.targetLanguages);
          break;
        }

        case "download": {
          if (!search.lang) return error("Invalid GET request", 400);
          const url = `https://crowdin.com/backend/download/project/\
          ${search.project}/${search.lang}.zip`
          .replace(/[ ]+/g, "");

          let res = await fetch(url);
          res = new Response(res.body, res);
          res.headers.append("Access-Control-Allow-Origin", "*");
          return res;
        }

        default: {
          return error("Invalid GET request", 400);
        }
    }
}

/* =======================
 *     VALIDATION CODE
 * ======================= */
function validateMethod(request) {
  if (request.method === "OPTIONS") {
    return new Response('', {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Max-Age": "3600"
      }
    })
  }
  return error("Method not allowed!", 405)
}

function validateQuery(search) {
  for (var key in search) {
    var value = search[key];
    var valueRegex = /[^\w- ]/;
    var keyRegex = /[^A-Za-z]/;
    if (keyRegex.test(key)) {
      var pos = key.search(keyRegex);
      var char = key.charAt(pos);
      var split = key.split(char, 1);
      var here = `${split[0]}${char}<--[HERE]`;
      return error("Bad query!", 400, here)
    } else if (valueRegex.test(value)) {
      var pos = value.search(valueRegex);
      var char = value.charAt(pos);
      var split = value.split(char, 1);
      var here = `${split[0]}${char}<--[HERE] (position ${pos + 1})`
      return error("Bad query!", 400, here)
    }
  }
  return true;
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

function response(json) {
    return new Response(stringify(json), defaultHeaders);
}
