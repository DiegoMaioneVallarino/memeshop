export type ImageLayer = { id: string; type: 'image'; name: string; uri: string; sourceWidth: number; sourceHeight: number; x: number; y: number; width: number; height: number; rotation: number; opacity: number; visible: boolean };
export type ShapeLayer = { id: string; type: 'shape'; name: string; color: string; x: number; y: number; width: number; height: number; rotation: number; opacity: number; visible: boolean };
export type EditorLayer = ImageLayer | ShapeLayer;
export type PhotoAsset = { uri: string; width: number; height: number; name?: string };
export type EditorDocument = { width: number; height: number; layers: EditorLayer[]; selectedId: string | null };
