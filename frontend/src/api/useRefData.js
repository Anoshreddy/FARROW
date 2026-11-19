import { api } from './client';
import { useApi } from './useApi';

// Raw materials + warehouses are needed by almost every page (filters,
// joins from numeric ids to names). One hook so the pages stay consistent.
export function useRefData() {
  const state = useApi(
    async () => {
      const [materials, warehouses] = await Promise.all([
        api.getRawMaterials(),
        api.getWarehouses(),
      ]);
      return { materials, warehouses };
    },
    []
  );
  return {
    status: state.status,
    error: state.error,
    reload: state.reload,
    materials: state.data?.materials ?? [],
    warehouses: state.data?.warehouses ?? [],
  };
}
