from __future__ import annotations
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from .storage import atomic_json, digest, file_hash, new_id, now, read_json, read_jsonl, staging, write_jsonl, locate
from evals.scenarios import SCENARIOS, INTENTS

FIXED = ["Ticket编号", "标题", "业务线", "窗口开始", "窗口结束", "输入状态", "数据说明", "同步时间",
         "Shadow参考_意图", "Shadow参考_问题摘要", "Shadow参考_方案摘要"]
def annotation_columns():
    return [column for scenario in SCENARIOS.values() for column in
            [scenario.prefix + "_" + suffix for suffix in ("纳入", "审核", *scenario.columns().values(), "必答点", "禁止断言")]] + ["审核人", "备注"]

TECH = ["export_id", "source_id", "input_hash", "snapshot_version", "base_id", "table_id", "record_id"]


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError("missing timestamp")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("timestamp requires timezone")
    return result.astimezone(timezone.utc)


def message_text(messages):
    return "\n\n".join(f'[{m["messageId"]}] {m["createdAt"]} {m.get("senderLabel") or m["senderRole"]}\n{m["text"]}'
                       + (f'\n回复: {m["replyTo"]}' if m.get("replyTo") else "") for m in messages)


def chunks(text, units=15000):
    # Limit UTF-16 units, not Python code points (emoji use two units in Excel).
    result, part, count = [], [], 0
    for char in str(text or ""):
        size = 2 if ord(char) > 0xffff else 1
        if count + size > units:
            result.append("".join(part)); part, count = [], 0
        part.append(char); count += size
    result.append("".join(part))
    return result


def freeze_row(row):
    ticket = row["ticket"]
    if set(ticket) != {"baseId", "tableId", "recordId"} or not all(isinstance(v, str) and v for v in ticket.values()):
        raise ValueError("Invalid Ticket identity")
    source = "ticket_" + digest(ticket)[:24]
    errors, selected, start, end = [], [], "", ""
    timing = row.get("timing", [])
    if row.get("history_complete") is not True:
        errors.append("历史不完整")
    try:
        ids = [m["messageId"] for m in timing]
        if len(ids) != len(set(ids)):
            raise ValueError("重复消息ID")
        roots = {m["rootId"] for m in timing if m.get("rootId")}
        candidates = [m for m in timing if m["messageId"] in roots] if roots else [m for m in timing if not m.get("parentId")]
        if len(candidates) != 1 or len(roots) > 1:
            raise ValueError("缺少或无法确定唯一根消息")
        t0 = timestamp(candidates[0].get("createdAt")); cutoff = t0 + timedelta(minutes=5)
        start, end = t0.isoformat(), cutoff.isoformat()
        allowed = set()
        for m in timing:
            created = timestamp(m.get("createdAt"))
            if created < t0:
                raise ValueError("消息早于根消息")
            if t0 <= created < cutoff:
                if m.get("deleted") or (m.get("updatedAt") and timestamp(m["updatedAt"]) >= cutoff):
                    raise ValueError("窗口消息已删除或窗口后编辑，无法还原")
                allowed.add(m["messageId"])
        prepared_ids = set()
        for m in row.get("messages", []):
            if m["messageId"] not in allowed:
                continue
            if m["messageId"] in prepared_ids:
                raise ValueError("重复预处理消息")
            prepared_ids.add(m["messageId"])
            raw = next(x for x in timing if x["messageId"] == m["messageId"])
            if timestamp(m.get("createdAt")) != timestamp(raw.get("createdAt")):
                raise ValueError("预处理消息时间不一致")
            selected.append({k: v for k, v in m.items() if k in
                             {"messageId", "createdAt", "senderRole", "senderLabel", "text", "hasArtifact"}
                             or (k == "replyTo" and v in allowed)})
        if prepared_ids != allowed or not selected or not any(m.get("text", "").strip() for m in selected):
            raise ValueError("窗口内容缺失")
        selected.sort(key=lambda m: (timestamp(m["createdAt"]), m["messageId"]))
    except (ValueError, KeyError, TypeError) as error:
        errors.append(str(error)); selected = []
    payload = {"messages": selected, "window_start": start, "window_end": end}
    return {"source_id": source, "ticket": ticket, "number": row.get("number", ""),
            "snapshot_version": row.get("snapshot_version"), "input": payload,
            "input_hash": digest(payload), "eligible": not errors, "errors": errors,
            "exclusion_tokens": [ticket["recordId"]] + ([f'ticket-{row["number"]}', f'ticket_{row["number"]}'] if row.get("number") else [])}


def write_table(path, headers, rows, hidden=(), dropdowns=None):
    book = Workbook(); sheet = book.active; sheet.title = "Tickets"
    sheet.append(headers)
    for index, header in enumerate(headers, 1):
        cell = sheet.cell(1, index)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="386641" if header.startswith(("分析_", "答复_")) else "24476A")
        col = get_column_letter(index)
        sheet.column_dimensions[col].width = 48 if any(k in header for k in ("消息", "摘要", "答复", "输出", "参考", "理由")) else 22
        if header in hidden:
            sheet.column_dimensions[col].hidden = True
    for row in rows:
        values = [row.get(h, "") for h in headers]
        sheet.append(values)
        for cell in sheet[sheet.max_row]:
            if isinstance(cell.value, str):
                if len(cell.value.encode("utf-16-le")) // 2 > 32767:
                    raise ValueError(f"Cell too long: {cell.coordinate}")
                cell.data_type = "s"  # formula-like business text is always literal
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    sheet.freeze_panes = "D2"; sheet.auto_filter.ref = sheet.dimensions
    for column, options in (dropdowns or {}).items():
        letter = get_column_letter(headers.index(column) + 1)
        validation = DataValidation(type="list", formula1='"' + ",".join(options) + '"', allow_blank=False)
        validation.errorTitle = "无效值"; validation.error = "请使用下拉选项"; validation.showErrorMessage = True
        sheet.add_data_validation(validation); validation.add(f"{letter}2:{letter}{max(2, sheet.max_row)}")
    book.save(path)
    # Native Excel rendering isn't implied; verify persisted values with an independent readback.
    loaded = load_workbook(path, data_only=False)
    if loaded.active.max_row != len(rows) + 1:
        raise ValueError("Workbook readback mismatch")
    loaded.close()


def export_dataset(root, rows, source_label, prompts=None):
    if not rows:
        raise ValueError("No Tickets selected")
    frozen = [freeze_row(row) for row in rows]
    if len({r["source_id"] for r in frozen}) != len(frozen):
        raise ValueError("Duplicate Ticket identity")
    export_id = new_id("export")
    records = []
    message_count = max(len(chunks(message_text(item["input"]["messages"]))) for item in frozen)
    message_headers = [f"窗口消息_{n+1}" for n in range(message_count)]
    for row, item in zip(rows, frozen):
        shadow = row.get("shadow") or {}
        analysis = (shadow.get("analysis") or {}).get("analysis") or {}
        intent, result = analysis.get("intent") or {}, analysis.get("result") or {}
        record = dict(zip(FIXED, [str(row.get("number", "")), row.get("title", ""), row.get("business", ""),
                  item["input"]["window_start"], item["input"]["window_end"], "可用" if item["eligible"] else "不可用",
                  "；".join(item["errors"]) or ("当前快照回放；含附件请确认文本充分" if any(m.get("hasArtifact") for m in item["input"]["messages"]) else "当前快照回放；非严格历史现场"),
                  row.get("synced_at", ""), intent.get("intentType", ""), intent.get("summary", ""),
                  result.get("solutionSummary", "")]))
        record.update({h: "" for h in annotation_columns()})
        for scenario in SCENARIOS.values():
            record.update({scenario.prefix + "_纳入": "否", scenario.prefix + "_审核": "待审核"})
        record.update(dict(zip(message_headers, chunks(message_text(item["input"]["messages"])))))
        record.update({"export_id": export_id, "source_id": item["source_id"], "input_hash": item["input_hash"],
                       "snapshot_version": str(item["snapshot_version"]), "base_id": item["ticket"]["baseId"],
                       "table_id": item["ticket"]["tableId"], "record_id": item["ticket"]["recordId"]})
        # Split any long read-only references into additional columns too.
        records.append(record)
    extras = []
    for header in FIXED:
        count = max(len(chunks(record[header])) for record in records)
        if count > 1:
            for i in range(1, count):
                extras.append(f"{header}_{i+1}")
            for record in records:
                parts = chunks(record[header]); record[header] = parts[0]
                for i, part in enumerate(parts[1:], 2): record[f"{header}_{i}"] = part
    headers = FIXED + extras + message_headers + annotation_columns() + TECH
    with staging(Path(root) / "exports", export_id) as path:
        write_jsonl(path / "inputs.jsonl", frozen)
        dropdowns = {"分析_意图": INTENTS}
        for scenario in SCENARIOS.values():
            dropdowns.update({scenario.prefix + "_纳入": ["否", "是"], scenario.prefix + "_审核": ["待审核", "已审核"]})
        write_table(path / "annotations.xlsx", headers, records, TECH, dropdowns)
        atomic_json(path / "manifest.json", {"schema_version": 1, "export_id": export_id, "created_at": now(),
                    "source": source_label, "window": "root <= timestamp < root + 5 minutes", "headers": headers,
                    "inputs_hash": file_hash(path / "inputs.jsonl"), "count": len(rows), "prompts": prompts or {}})
    return export_id


def import_dataset(root, excel, export=None, validate_only=False):
    excel = Path(excel); export = Path(export) if export else excel.parent
    manifest = read_json(export / "manifest.json")
    if manifest.get("schema_version") != 1 or file_hash(export / "inputs.jsonl") != manifest["inputs_hash"]:
        raise ValueError("Export schema or inputs hash mismatch")
    sources_list = read_jsonl(export / "inputs.jsonl")
    sources = {s["source_id"]: s for s in sources_list}
    if len(sources) != len(sources_list): raise ValueError("Duplicate source ID")
    workbook = load_workbook(excel, data_only=False)
    try:
        if len(workbook.worksheets) != 1: raise ValueError("Expected one worksheet")
        sheet = workbook.active
        headers = [c.value for c in sheet[1]]
        if len(set(headers)) != len(headers) or set(headers) != set(manifest["headers"]):
            raise ValueError("Workbook columns changed")
        cases, errors, seen, excluded = [], [], set(), 0
        for n, cells in enumerate(sheet.iter_rows(min_row=2), 2):
            if all(c.value is None for c in cells): continue
            row = {h: str(c.value or "").strip() for h, c in zip(headers, cells)}
            try:
                if any(c.data_type == "f" for c in cells): raise ValueError("Formulas are not supported")
                sid = row["source_id"]
                if sid in seen: raise ValueError("Duplicate Ticket row")
                seen.add(sid)
                source = sources[sid]
                if row["snapshot_version"] != str(source["snapshot_version"]): raise ValueError("Snapshot version changed")
                if row["窗口开始"] != source["input"]["window_start"] or row["窗口结束"] != source["input"]["window_end"]:
                    raise ValueError("Window timestamps changed")
                if row["export_id"] != manifest["export_id"] or row["input_hash"] != source["input_hash"] or digest(source["input"]) != source["input_hash"]:
                    raise ValueError("Input identity/hash changed")
                if [row[k] for k in ("base_id", "table_id", "record_id")] != [source["ticket"][k] for k in ("baseId", "tableId", "recordId")]:
                    raise ValueError("Ticket identity changed")
                # Do not strip individual message chunks: whitespace is evidence too.
                raw_display = "".join(str(c.value or "") for h, c in sorted(zip(headers, cells), key=lambda x: manifest["headers"].index(x[0])) if h.startswith("窗口消息_"))
                if raw_display != message_text(source["input"]["messages"]): raise ValueError("Read-only window text changed")
                for scenario in SCENARIOS.values():
                    p = scenario.prefix
                    if row[p + "_纳入"] not in ("是", "否") or row[p + "_审核"] not in ("待审核", "已审核"):
                        raise ValueError(f"{p}: invalid inclusion/review state")
                    if row[p + "_纳入"] == "否": excluded += 1; continue
                    if not source["eligible"]: raise ValueError(f"{p}: unusable input")
                    if row[p + "_审核"] != "已审核" or not row["审核人"]: raise ValueError(f"{p}: review and reviewer required")
                    expected = {"required_points": row[p + "_必答点"], "forbidden_claims": row[p + "_禁止断言"]}
                    expected.update({field: row[p + "_" + column] for field, column in scenario.columns().items()})
                    scenario.validate_case(expected)
                    cases.append({"case_id": sid + "." + scenario.id, "scenario_id": scenario.id,
                                  "scenario_version": scenario.version, "input_ref": sid, "input_hash": source["input_hash"],
                                  "expected": expected, "expected_hash": digest(expected), "reviewer": row["审核人"], "notes": row["备注"]})
            except (KeyError, ValueError) as error:
                errors.append(f"row {n} Ticket {row.get('Ticket编号', '')}: {error}")
        if errors: raise ValueError("Import rejected:\n" + "\n".join(errors))
        if not cases: raise ValueError("No reviewed included cases")
    finally: workbook.close()
    cases.sort(key=lambda c: c["case_id"])
    inputs = [sources[sid] for sid in sorted({c["input_ref"] for c in cases})]
    content_hash = digest({"cases": cases, "inputs": inputs, "prompts": manifest.get("prompts", {})})
    dataset_id = "dataset_" + content_hash[:24]
    report = {"included": len(cases), "excluded_scenarios": excluded, "omitted_ticket_rows": len(sources) - len(seen)}
    if validate_only: return {"valid": True, **report}
    target = locate(root, "datasets", dataset_id)
    if not target.exists():
        with staging(target.parent, dataset_id) as path:
            shutil.copyfile(excel, path / "annotations.xlsx")
            write_jsonl(path / "inputs.jsonl", inputs); write_jsonl(path / "cases.jsonl", cases)
            atomic_json(path / "import-report.json", report)
            atomic_json(path / "manifest.json", {"schema_version": 1, "dataset_id": dataset_id, "created_at": now(),
                        "export_id": manifest["export_id"], "content_hash": content_hash, "prompts": manifest.get("prompts", {}),
                        "inputs_hash": file_hash(path / "inputs.jsonl"), "cases_hash": file_hash(path / "cases.jsonl")})
    return {"dataset_id": dataset_id, **report}


def load_dataset(root, dataset_id):
    path = locate(root, "datasets", dataset_id); manifest = read_json(path / "manifest.json")
    if file_hash(path / "inputs.jsonl") != manifest["inputs_hash"] or file_hash(path / "cases.jsonl") != manifest["cases_hash"]:
        raise ValueError("Frozen dataset modified")
    cases, inputs = read_jsonl(path / "cases.jsonl"), read_jsonl(path / "inputs.jsonl")
    if digest({"cases": cases, "inputs": inputs, "prompts": manifest.get("prompts", {})}) != manifest["content_hash"]:
        raise ValueError("Frozen dataset metadata modified")
    return manifest, cases, {s["source_id"]: s for s in inputs}
