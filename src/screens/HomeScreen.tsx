/**
 * Portal de inicio: el logo de Memeshop y varias formas de empezar (foto, herramienta, plantilla, tamaño de red).
 * Cada atajo crea un proyecto nuevo y lleva directo a lo que el usuario quería hacer.
 */
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import type { ProjectMeta } from '../services/projects';
import { listTemplates, type TemplateMeta } from '../services/templates';
import { BUILTIN_TEMPLATES } from '../templates/builtin';
import { CANVAS_PRESETS } from '../utils/canvas';
import { TemplateCard } from '../components/editor/TemplateLibrary';
import { LOOKS } from '../tools/effects/presets';
import { useFilterPreview } from '../tools/effects/previews';

export type QuickAction = 'removeBg' | 'text' | 'liquify' | 'adjust' | 'effects';
export type StartIntent =
  | { kind: 'photo'; then?: QuickAction }
  | { kind: 'blank'; width: number; height: number }
  | { kind: 'template'; meta: TemplateMeta }
  | { kind: 'look'; name: string };

const QUICK: { id: QuickAction; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { id: 'removeBg', label: 'Quitar fondo', icon: 'scissors' },
  { id: 'text', label: 'Añadir texto', icon: 'type' },
  { id: 'liquify', label: 'Licuar', icon: 'wind' },
  { id: 'adjust', label: 'Ajustes', icon: 'sliders' },
  { id: 'effects', label: 'Efectos', icon: 'zap' },
];
const GREEN = '#0b6e09', INK = '#111';

function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode }) {
  return <View style={s.section}>
    <View style={s.sectionHead}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action && onAction ? <Pressable hitSlop={10} onPress={onAction}><Text style={s.sectionAction}>{action}</Text></Pressable> : null}
    </View>
    {children}
  </View>;
}

function LookCard({ name, description, onPress }: { name: string; description: string; onPress: () => void }) {
  const uri = useFilterPreview(name);
  return <Pressable onPress={onPress} style={s.look} accessibilityLabel={`Estilo ${name}`}>
    <View style={s.lookThumb}>{uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} /> : null}</View>
    <Text style={s.lookName} numberOfLines={1}>{name}</Text>
    <Text style={s.lookDesc} numberOfLines={2}>{description}</Text>
  </Pressable>;
}

function Aspect({ w, h }: { w: number; h: number }) {
  const k = 46 / Math.max(w, h);
  return <View style={{ width: w * k, height: h * k, borderRadius: 4, borderWidth: 2.5, borderColor: GREEN }} />;
}

export function HomeScreen({ projects, onStart, onOpen, onSeeAll }: {
  projects: ProjectMeta[]; onStart: (intent: StartIntent) => void; onOpen: (p: ProjectMeta) => void; onSeeAll: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [mine, setMine] = useState<TemplateMeta[]>([]);
  useEffect(() => { void listTemplates().then(setMine).catch(() => setMine([])); }, []);
  const templates: TemplateMeta[] = [...mine, ...BUILTIN_TEMPLATES.map(({ document: _d, ...meta }) => meta)];

  return <View style={[s.root, { paddingTop: insets.top + 6 }]}>
    <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <Image source={require('../assets/memeshop-logo.png')} style={s.logo} />
        <View style={{ flex: 1 }}>
          <Text style={s.brand}>MEMESHOP</Text>
          <Text style={s.heading}>Crear</Text>
        </View>
        <Pressable accessibilityLabel="Buscar en mis proyectos" hitSlop={10} onPress={onSeeAll} style={s.headerIcon}><Feather name="search" size={24} color={INK} /></Pressable>
      </View>

      {projects.length > 0 && <Section title="Proyectos recientes" action="Ver todos" onAction={onSeeAll}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {projects.slice(0, 12).map(p => <Pressable key={p.id} onPress={() => onOpen(p)} style={s.recent} accessibilityLabel={`Abrir ${p.name}`}>
            <View style={s.recentThumb}>
              {p.thumbnail ? <Image source={{ uri: p.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Feather name="image" size={30} color="#999" />}
            </View>
            <Text numberOfLines={1} style={s.recentName}>{p.name}</Text>
          </Pressable>)}
        </ScrollView>
      </Section>}

      <Section title="Empieza con una herramienta">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {QUICK.map(q => <Pressable key={q.id} onPress={() => onStart({ kind: 'photo', then: q.id })} style={s.quick} accessibilityLabel={q.label}>
            <View style={s.quickIcon}><Feather name={q.icon} size={30} color={GREEN} /></View>
            <Text style={s.quickLabel} numberOfLines={1}>{q.label}</Text>
          </Pressable>)}
        </ScrollView>
      </Section>

      <Section title="Plantillas de memes">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {templates.map(t => <TemplateCard key={t.id} meta={t} width={150} light onPress={() => onStart({ kind: 'template', meta: t })} />)}
        </ScrollView>
      </Section>

      <Section title="Plantillas de efectos">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {LOOKS.map(l => <LookCard key={l.id} name={l.name} description={l.description} onPress={() => onStart({ kind: 'look', name: l.name })} />)}
        </ScrollView>
      </Section>

      <Section title="Tamaños para redes">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {CANVAS_PRESETS.map(p => <Pressable key={p.id} onPress={() => onStart({ kind: 'blank', width: p.width, height: p.height })} style={s.size} accessibilityLabel={`${p.network} ${p.label}`}>
            <View style={s.sizeIcon}><Aspect w={p.width} h={p.height} /></View>
            <Text style={s.sizeNetwork} numberOfLines={1}>{p.network}</Text>
            <Text style={s.sizeLabel} numberOfLines={1}>{p.label}</Text>
          </Pressable>)}
        </ScrollView>
      </Section>
    </ScrollView>

    <Pressable onPress={() => onStart({ kind: 'photo' })} style={[s.cta, { bottom: 18 + insets.bottom }]} accessibilityLabel="Comienza con una foto">
      <Feather name="plus" size={24} color="#fff" /><Text style={s.ctaText}>Comienza con una foto</Text>
    </Pressable>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  logo: { width: 76, height: 76, borderRadius: 18 },
  brand: { fontSize: 12, fontWeight: '800', color: '#148d00', letterSpacing: 1 },
  heading: { fontSize: 36, fontWeight: '800', color: INK },
  headerIcon: { padding: 6 },
  section: { marginTop: 22 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: '#333' },
  sectionAction: { color: GREEN, fontWeight: '700', fontSize: 15 },
  row: { paddingHorizontal: 20, gap: 12 },
  recent: { width: 130 },
  recentThumb: { width: 130, height: 130, borderRadius: 14, backgroundColor: '#f0f0f0', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  recentName: { marginTop: 6, color: '#444', fontSize: 13 },
  quick: { width: 92, alignItems: 'center', gap: 8 },
  quickIcon: { width: 84, height: 84, borderRadius: 20, backgroundColor: '#f2f7f1', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e1ece0' },
  quickLabel: { color: '#444', fontSize: 13 },
  look: { width: 140 },
  lookThumb: { width: 140, height: 140, borderRadius: 16, backgroundColor: '#f0f0f0', overflow: 'hidden' },
  lookName: { marginTop: 6, color: INK, fontWeight: '700', fontSize: 14 },
  lookDesc: { color: '#777', fontSize: 11 },
  size: { width: 112, padding: 10, borderRadius: 14, backgroundColor: '#f6f6f6', alignItems: 'center', gap: 3 },
  sizeIcon: { height: 54, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  sizeNetwork: { color: INK, fontWeight: '700', fontSize: 12 },
  sizeLabel: { color: '#777', fontSize: 11 },
  cta: { position: 'absolute', left: 24, right: 24, backgroundColor: GREEN, borderRadius: 30, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, elevation: 8, shadowColor: '#000', shadowOpacity: .2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  ctaText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
