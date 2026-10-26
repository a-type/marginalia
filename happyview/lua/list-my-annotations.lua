local annotation_collection = "com.marginsbible.annotation"

local function query_all(collection, did)
  local records = {}
  local request = {
    collection = collection,
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

local function is_after_cursor(record, cursor_created_at, cursor_uri)
  if record.createdAt == cursor_created_at then
    return record.uri > cursor_uri
  end
  return record.createdAt < cursor_created_at
end

function handle()
  if not caller_did then
    return { records = toarray({}) }
  end

  local limit = tonumber(params.limit) or 100
  if limit < 1 or limit > 100 or limit ~= math.floor(limit) then
    error("Invalid limit")
  end

  local cursor_created_at
  local cursor_uri
  if params.cursor then
    cursor_created_at, cursor_uri =
      string.match(params.cursor, "^(.-)\t(at://[^/]+/com%.marginsbible%.annotation/[^/]+)$")
    if not cursor_created_at or not cursor_uri then
      error("Invalid cursor")
    end
  end

  local records = query_all(annotation_collection, caller_did)
  local matching_records = {}
  for _, record in ipairs(records) do
    if
      type(record.uri) == "string"
      and type(record.createdAt) == "string"
      and type(record.comment) == "string"
      and string.match(record.comment, "%S")
      and type(record.verses) == "table"
      and (not cursor_created_at or is_after_cursor(record, cursor_created_at, cursor_uri))
    then
      table.insert(matching_records, record)
    end
  end

  table.sort(matching_records, function(left, right)
    if left.createdAt == right.createdAt then
      return left.uri < right.uri
    end
    return left.createdAt > right.createdAt
  end)

  local page_records = {}
  local has_more = #matching_records > limit
  for index = 1, math.min(limit, #matching_records) do
    table.insert(page_records, matching_records[index])
  end

  local response = { records = toarray(page_records) }
  if has_more then
    local last_record = page_records[#page_records]
    response.cursor = last_record.createdAt .. "\t" .. last_record.uri
  end
  return response
end
