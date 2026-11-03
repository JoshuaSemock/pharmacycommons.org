import { describe, expect, it } from 'vitest'
import { LABEL_CHARS, buildSystemTrees, classDepth, layoutTree, parseHierarchy, pathTo, systemSummary, wrapLabel } from './hierarchy'
import type { HierarchyPayload, TreeNode } from './hierarchy'

const MET = 1001923
const EMPA = 1001318

// The live shape for metformin and empagliflozin (network_hierarchy, 2026-11-03).
const raw = {
  pcids: [EMPA, MET],
  entities: [
    { pcid: EMPA, slug: 'empagliflozin', name: 'empagliflozin', entity_type: 'moiety', class_type: null, term_type: 'Core moiety' },
    { pcid: MET, slug: 'metformin', name: 'metformin', entity_type: 'moiety', class_type: null, term_type: 'Core moiety' },
  ],
  anchors: [
    { concept: EMPA, class: 5001830 },
    { concept: EMPA, class: 5002691 },
    { concept: MET, class: 5001822 },
    { concept: MET, class: 5002691 },
  ],
  nodes: [
    { pcid: 5000510, slug: 'alimentary', name: 'Alimentary tract and metabolism', class_type: 'atc', parent: null, members: [EMPA, MET], meeting: false },
    { pcid: 5000568, slug: 'diabetes-drugs', name: 'Drugs used in diabetes', class_type: 'atc', parent: '5000510', members: [EMPA, MET], meeting: false },
    { pcid: 5001574, slug: 'blood-glucose-lowering', name: 'Blood glucose lowering drugs, excl. insulins', class_type: 'atc', parent: 5000568, members: [EMPA, MET], meeting: true },
    { pcid: 5001822, slug: 'biguanides', name: 'Biguanides', class_type: 'atc', parent: 5001574, members: [MET], meeting: false },
    { pcid: 5001830, slug: 'sglt2', name: 'Sodium-glucose co-transporter 2 (SGLT2) inhibitors', class_type: 'atc', parent: 5001574, members: [EMPA], meeting: false },
    { pcid: 5002488, slug: 'hormones', name: 'Hormones/synthetics/modifiers', class_type: 'va', parent: null, members: [EMPA, MET], meeting: false },
    { pcid: 5002689, slug: 'bgr', name: 'Blood glucose regulation agents', class_type: 'va', parent: 5002488, members: [EMPA, MET], meeting: false },
    { pcid: 5002691, slug: 'oral-hypoglycemics', name: 'Oral hypoglycemic agents, oral', class_type: 'va', parent: 5002689, members: [EMPA, MET], meeting: true },
    { pcid: 5009999, slug: 'only-empa', name: 'Only empagliflozin class', class_type: 'epc', parent: null, members: [EMPA], meeting: false },
  ],
}

const payload = (): HierarchyPayload => {
  const p = parseHierarchy(raw)
  if (!p) throw new Error('fixture did not parse')
  return p
}

const find = (nodes: TreeNode[], name: string): TreeNode | undefined => {
  for (const n of nodes) {
    if (n.name === name) return n
    const hit = find(n.children, name)
    if (hit) return hit
  }
  return undefined
}

describe('parseHierarchy', () => {
  it('reads the document and accepts string parents', () => {
    const p = payload()
    expect(p.pcids).toEqual([EMPA, MET])
    expect(p.nodes).toHaveLength(9)
    expect(p.nodes.find(n => n.pcid === 5000568)?.parent).toBe(5000510)
    expect(p.entities[0].name).toBe('empagliflozin')
  })

  it('rejects anything that is not a hierarchy document', () => {
    expect(parseHierarchy(null)).toBeNull()
    expect(parseHierarchy([])).toBeNull()
    expect(parseHierarchy({ pcids: [] })).toBeNull()
    expect(parseHierarchy({ pcids: [1, 2, 3, 4, 5] })).toBeNull()
  })

  it('drops malformed rows instead of throwing', () => {
    const p = parseHierarchy({ pcids: [MET], entities: [], anchors: [{ concept: 'x' }, null], nodes: [{ pcid: 1 }, 7, { pcid: 2, slug: 's', name: 'n' }] })
    expect(p?.anchors).toEqual([])
    expect(p?.nodes).toHaveLength(1)
    expect(p?.nodes[0].class_type).toBe('other')
  })
})

describe('buildSystemTrees', () => {
  it('puts systems where the concepts meet first, in the usual system order', () => {
    const trees = buildSystemTrees(payload())
    expect(trees.map(t => t.system)).toEqual(['atc', 'va', 'epc'])
  })

  it('builds ATC as one tree: shared ancestors once, each drug under its own class', () => {
    const atc = buildSystemTrees(payload())[0]
    expect(atc.roots).toHaveLength(1)
    const root = atc.roots[0]
    expect(root.name).toBe('Alimentary tract and metabolism')
    const lowest = find(atc.roots, 'Blood glucose lowering drugs, excl. insulins')
    expect(lowest?.meeting).toBe(true)
    expect(lowest?.children.map(c => c.name).sort()).toEqual(['Biguanides', 'Sodium-glucose co-transporter 2 (SGLT2) inhibitors'])
    expect(find(atc.roots, 'Biguanides')?.children.map(c => c.name)).toEqual(['metformin'])
    expect(find(atc.roots, 'Sodium-glucose co-transporter 2 (SGLT2) inhibitors')?.children.map(c => c.name)).toEqual(['empagliflozin'])
  })

  it('puts both drugs under the VA class they share', () => {
    const va = buildSystemTrees(payload())[1]
    const oral = find(va.roots, 'Oral hypoglycemic agents, oral')
    expect(oral?.meeting).toBe(true)
    expect(oral?.children.map(c => c.name).sort()).toEqual(['empagliflozin', 'metformin'])
    expect(va.meetings.map(m => m.name)).toEqual(['Oral hypoglycemic agents, oral'])
  })

  it('lists classes holding only one concept after the shared ones, and finds no meeting there', () => {
    const epc = buildSystemTrees(payload())[2]
    expect(epc.meetings).toEqual([])
  })

  it('orders shared branches before single-concept branches', () => {
    const p = payload()
    p.nodes.push({ pcid: 5007777, slug: 'a-first', name: 'A class only metformin has', class_type: 'atc', parent: 5001574, members: [MET], meeting: false })
    const lowest = find(buildSystemTrees(p)[0].roots, 'Blood glucose lowering drugs, excl. insulins')
    expect(lowest?.children[0].name).toBe('A class only metformin has')
    const shared: HierarchyPayload = { ...p, nodes: [...p.nodes, { pcid: 5007778, slug: 'z-shared', name: 'Z shared child', class_type: 'atc', parent: 5001574, members: [EMPA, MET], meeting: false }] }
    expect(find(buildSystemTrees(shared)[0].roots, 'Blood glucose lowering drugs, excl. insulins')?.children[0].name).toBe('Z shared child')
  })

  it('keeps a concept that is itself a class in place rather than hanging it under itself', () => {
    const p: HierarchyPayload = {
      pcids: [5001822, 5001830],
      entities: [
        { pcid: 5001822, slug: 'biguanides', name: 'Biguanides', entity_type: 'class', class_type: 'atc', term_type: null },
        { pcid: 5001830, slug: 'sglt2', name: 'SGLT2', entity_type: 'class', class_type: 'atc', term_type: null },
      ],
      anchors: [
        { concept: 5001822, class: 5001822 },
        { concept: 5001830, class: 5001830 },
      ],
      nodes: [
        { pcid: 5001574, slug: 'bgl', name: 'Blood glucose lowering', class_type: 'atc', parent: null, members: [5001822, 5001830], meeting: true },
        { pcid: 5001822, slug: 'biguanides', name: 'Biguanides', class_type: 'atc', parent: 5001574, members: [5001822], meeting: false },
        { pcid: 5001830, slug: 'sglt2', name: 'SGLT2', class_type: 'atc', parent: 5001574, members: [5001830], meeting: false },
      ],
    }
    const tree = buildSystemTrees(p)[0]
    const big = find(tree.roots, 'Biguanides')
    expect(big?.isConcept).toBe(true)
    expect(big?.children).toEqual([])
  })

  it('does not loop on a cycle in the data', () => {
    const p: HierarchyPayload = {
      pcids: [MET],
      entities: payload().entities,
      anchors: [{ concept: MET, class: 1 }],
      nodes: [
        { pcid: 1, slug: 'a', name: 'A', class_type: 'atc', parent: 2, members: [MET], meeting: false },
        { pcid: 2, slug: 'b', name: 'B', class_type: 'atc', parent: 1, members: [MET], meeting: false },
      ],
    }
    expect(() => buildSystemTrees(p)).not.toThrow()
    expect(pathTo(1, p).map(c => c.name)).toEqual(['B', 'A'])
    expect(classDepth(p.nodes[0], new Map(p.nodes.map(n => [n.pcid, n])))).toBe(1)
  })
})

describe('pathTo and summaries', () => {
  it('walks from the root down to the class', () => {
    expect(pathTo(5001574, payload()).map(c => c.name)).toEqual(['Alimentary tract and metabolism', 'Drugs used in diabetes', 'Blood glucose lowering drugs, excl. insulins'])
  })

  it('says where two concepts meet, in words', () => {
    const p = payload()
    const [atc, , epc] = buildSystemTrees(p)
    expect(systemSummary(atc, p)).toBe('empagliflozin and metformin: lowest class in common is Blood glucose lowering drugs, excl. insulins.')
    expect(systemSummary(epc, p)).toBe('No class in FDA EPC holds more than one of them.')
  })

  it('counts classes for a single concept', () => {
    const p = { ...payload(), pcids: [MET] }
    expect(systemSummary(buildSystemTrees(p)[0], p)).toBe('5 classes in WHO ATC.')
  })
})

describe('layoutTree', () => {
  it('puts the root left, children to its right, and centres a parent on its children', () => {
    const atc = buildSystemTrees(payload())[0]
    const lay = layoutTree(atc.roots)
    const at = (name: string) => lay.placed.find(p => p.node.name === name)
    const root = at('Alimentary tract and metabolism')
    const lowest = at('Blood glucose lowering drugs, excl. insulins')
    const big = at('Biguanides')
    const sg = at('Sodium-glucose co-transporter 2 (SGLT2) inhibitors')
    expect(root && lowest && big && sg).toBeTruthy()
    if (!root || !lowest || !big || !sg) return
    expect(lowest.x).toBeGreaterThan(root.x)
    expect(big.x).toBeGreaterThan(lowest.x)
    expect(lowest.y).toBeCloseTo((big.y + sg.y) / 2 + 0, 0)
    // A column never starts before the previous column's labels end.
    expect(lowest.x).toBeGreaterThan(root.right)
  })

  it('gives every leaf its own row and no two nodes in a column the same row', () => {
    const lay = layoutTree(buildSystemTrees(payload())[0].roots)
    const leaves = lay.placed.filter(p => p.node.children.length === 0)
    expect(new Set(leaves.map(l => l.y)).size).toBe(leaves.length)
    expect(lay.height).toBeGreaterThan(leaves.length * 20)
    expect(lay.edges).toHaveLength(lay.placed.length - 1)
  })

  it('returns an empty drawing for no roots', () => {
    const lay = layoutTree([])
    expect(lay.placed).toEqual([])
    expect(lay.width).toBeGreaterThan(0)
  })
})

describe('wrapLabel', () => {
  it('breaks at spaces within the limit and rejoins to the original text', () => {
    const name = 'Sodium-glucose co-transporter 2 (SGLT2) inhibitors'
    const lines = wrapLabel(name)
    expect(lines.join(' ')).toBe(name)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every(l => l.length <= LABEL_CHARS)).toBe(true)
  })

  it('keeps a short label whole and a long single word on its own line', () => {
    expect(wrapLabel('Biguanides')).toEqual(['Biguanides'])
    expect(wrapLabel('Hexamethylenetetraminecarboxylate-derivatives', 10)).toEqual(['Hexamethylenetetraminecarboxylate-derivatives'])
    expect(wrapLabel('')).toEqual([''])
  })

  it('gives a wrapped leaf more room so it never touches the next one', () => {
    const atc = buildSystemTrees(payload())[0]
    const lay = layoutTree(atc.roots)
    const sg = lay.placed.find(p => p.node.name === 'Sodium-glucose co-transporter 2 (SGLT2) inhibitors')
    const big = lay.placed.find(p => p.node.name === 'Biguanides')
    expect(sg?.lines.length).toBeGreaterThan(1)
    if (!sg || !big) return
    const gap = Math.abs(sg.y - big.y)
    expect(gap).toBeGreaterThanOrEqual((sg.lines.length * 15) / 2)
    // a wrapped parent label (SGLT2) never overlaps the node above it in its column
    const col = lay.placed.filter(p => p.depth === sg.depth).sort((a, b) => a.y - b.y)
    for (let i = 1; i < col.length; i++) {
      const need = (col[i - 1].lines.length + col[i].lines.length) * 7.5
      expect(col[i].y - col[i - 1].y).toBeGreaterThanOrEqual(need)
    }
    // narrower columns: nothing is wider than the wrap limit allows
    expect(lay.placed.every(p => p.labelWidth <= LABEL_CHARS * 6)).toBe(true)
  })
})
