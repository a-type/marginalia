local indexer_url = __ANNOTATION_INDEXER_URL__

function handle()
  if not caller_did then
    return { records = toarray({}) }
  end

  local book_id = params.bookId
  local chapter = tonumber(params.chapter)
  if type(book_id) ~= "string" or book_id == "" or string.find(book_id, "/", 1, true) then
    error("Invalid bookId")
  end
  if not chapter or chapter < 1 or chapter > 9007199254740991 or chapter ~= math.floor(chapter) then
    error("Invalid chapter")
  end

  local response = http.post(indexer_url .. "/annotations/chapter", {
    headers = { ["content-type"] = "application/json" },
    body = json.encode({
      callerDid = caller_did,
      bookId = book_id,
      chapter = chapter,
    }),
  })
  if response.status ~= 200 then
    error("Annotation indexer query failed (" .. response.status .. "): " .. response.body)
  end
  local result = json.decode(response.body)
  if type(result) ~= "table" or type(result.records) ~= "table" then
    error("Annotation indexer returned an invalid record page")
  end
  return { records = toarray(result.records) }
end
