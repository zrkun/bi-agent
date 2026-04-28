import { Database, FileUp, RadioTower, Server } from "lucide-react";

export type DatasourceTypeItem = {
  description: string;
  icon: string;
  name: string;
};

export type DatasourceTypeCategory = {
  items: DatasourceTypeItem[];
  key: string;
  title: string;
};

export type DatasourceTypesResponse = {
  categories: DatasourceTypeCategory[];
};

export const emptyDatasourceTypesResponse: DatasourceTypesResponse = {
  categories: [],
};

export const datasourceTypeIcons = {
  api: RadioTower,
  database: Database,
  file: FileUp,
  server: Server,
};
