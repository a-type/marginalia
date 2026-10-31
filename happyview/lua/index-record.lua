local indexer_url = __ANNOTATION_INDEXER_URL__

function handle()
  local response = http.post(indexer_url .. "/events", {
    headers = { ["content-type"] = "application/json" },
    body = json.encode({
      uri = uri,
      collection = collection,
      action = action,
      record = record,
    }),
  })
  if response.status ~= 200 then
    error("Annotation indexing failed (" .. response.status .. "): " .. response.body)
  end
  return true
end
