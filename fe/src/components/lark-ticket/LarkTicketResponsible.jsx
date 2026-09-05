import { User } from "../user/User.jsx";

function splitResponsibleNames(responsible) {
  return String(responsible || "").split(/[,，]/).map((name) => name.trim()).filter(Boolean);
}

export function LarkTicketResponsible({ responsible }) {
  const names = splitResponsibleNames(responsible);
  return names.length ? <span className="user-list">{names.map((name) => <User key={name} name={name} />)}</span> : "-";
}
