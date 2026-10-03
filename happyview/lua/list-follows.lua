local follow_collection = "com.apostilbible.follow"

local function query_all(did)
  local records = {}
  local request = {
    collection = follow_collection,
    did = did,
    limit = 100,
  }
  local cursors = {}

  while true do
    local page = db.query(request)
    for _, record in ipairs(page.records) do
      table.insert(records, record)
    end
    if not page.cursor then
      break
    end
    if cursors[page.cursor] then
      error("HappyView returned a repeated record cursor")
    end
    cursors[page.cursor] = true
    request.cursor = page.cursor
  end

  return records
end

function handle()
  if not caller_did then
    return { records = toarray({}) }
  end

  return { records = toarray(query_all(caller_did)) }
end