// next/cache inside the Worker: there is no server cache to revalidate. The
// page reloads its data after every call that changed something (see
// web/lib/database.tsx), which is what revalidatePath stood for.
export function revalidatePath(_path: string, _type?: 'layout' | 'page'): void {}
export function revalidateTag(_tag: string): void {}
