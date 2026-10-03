local highlight_collection = "com.apostilbible.highlight"

local function query_all(did, filter)
  local records = {}
  local request = {
    collection = highlight_collection,
    did = did,
    limit = 100,
    filter = filter,
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

  local book_id = params.bookId
  local chapter = tonumber(params.chapter)
  if type(book_id) ~= "string" or not string.match(book_id, "^[%w_%-]+$") then
    error("Invalid bookId")
  end
  if not chapter or chapter < 1 or chapter ~= math.floor(chapter) then
    error("Invalid chapter")
  end

  local records = query_all(caller_did, {
    field = "verse.id",
    op = "LIKE",
    value = book_id .. "/" .. chapter .. ":%",
  })

  return { records = toarray(records) }
end
