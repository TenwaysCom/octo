import { User } from "../user/User.jsx";

function splitResponsibleNames(responsible) {
  return String(responsible || "").split(/[,，]/).map((name) => name.trim()).filter(Boolean);
}

export function LarkTicketResponsible({ responsible, people }) {
  if (Array.isArray(people) && people.length) {
    return <span className="user-list">{people.map((person, index) => <User key={person.userId || `${person.name}:${index}`} name={person.name} avatarUrl={person.avatarUrl} />)}</span>;
  }
  const names = splitResponsibleNames(responsible);
  return names.length ? <span className="user-list">{names.map((name) => <User key={name} name={name} />)}</span> : "-";
}
