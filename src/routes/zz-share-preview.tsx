import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { NewShareModal } from "./talent.sharing";
export const Route = createFileRoute("/zz-share-preview")({ ssr: false, component: P });
function P() {
  const qc = useQueryClient();
  const mk = (id: string, name: string, parent: string | null = null) => ({ id, name, parent_id: parent });
  qc.setQueryData(["talent", "private-vault"], {
    folders: [mk("a","Personal"), mk("a1","Identity","a"), mk("a2","Medical aid","a"), mk("b","Dependents"), mk("c","Health"), mk("d","Insurance"), mk("e","Tax"), mk("f","Pets"), mk("g","Assets")],
    documents: [{id:"x",folder_id:"c",name:"Scan.pdf"},{id:"y",folder_id:"c",name:"Blood.pdf"},{id:"z",folder_id:"a1",name:"ID.pdf"}],
  });
  qc.setQueryData(["talent", "billing-documents"], { documents: [] });
  return <div className="tvp-portal"><NewShareModal onClose={() => {}} onCreated={() => {}} /></div>;
}
