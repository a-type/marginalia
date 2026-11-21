local indexer_url = __ANNOTATION_INDEXER_URL__

function handle()
  if not caller_did then
    return { records = toarray({}) }
  end

  local limit = 20
  if params.limit ~= nil then
    limit = tonumber(params.limit)
  end
  if not limit or limit < 1 or limit > 100 or limit ~= math.floor(limit) then
    error("Invalid limit")
  end
  local cursor = params.cursor
  if cursor and (type(cursor) ~= "string" or #cursor > 4096) then
    error("Invalid cursor")
  end

  local response = http.post(indexer_url .. "/annotations/following", {
    headers = { ["content-type"] = "application/json" },
    body = json.encode({ callerDid = caller_did, limit = limit, cursor = cursor }),
  })
  if response.status ~= 200 then
    error("Annotation indexer query failed (" .. response.status .. "): " .. response.body)
  end
  local result = json.decode(response.body)
  if type(result) ~= "table" or type(result.records) ~= "table" then
    error("Annotation indexer returned an invalid record page")
  end
  return { records = toarray(result.records), cursor = result.cursor }
end
