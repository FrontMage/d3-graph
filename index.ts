import * as d3 from 'd3';
import * as paper from 'paper';

export enum NodeType {
  rect = 'rect',
  circle = 'circle',
  ellipse = 'ellipse'
}

export interface LineStyle {
  x1?: string;
  y1?: string;
  x2?: string;
  y2?: string;
  stroke?: string;
  strokeWidth?: string;
  strokeOpacity?: string;
  markerEnd?: string;
  markerStart?: string;
  opacity?: string;
}

export interface TextStyle {
  x?: string;
  y?: string;
  stroke?: string;
  fill?: string;
  dx?: string;
  dy?: string;
  fontSize?: string;
  fontFamily?: string;
  opacity?: string;
  textAnchor?: string;
}

export interface ItemStyle {
  type?: NodeType;
  radius?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  width?: string;
  height?: string;
  strokeOpacity?: string;
  fillOpacity?: string;
  opacity?: string;
  x?: string;
  y?: string;
  rx?: string;
  ry?: string;
  cx?: string;
  cy?: string;
}

export interface Node {
  id: string;
  group: number;
  name: string;
  category: number;
  itemStyle?: ItemStyle;
  textStyle?: TextStyle;
}

export interface Link {
  target: string;
  source: string;
  strength: number;
  lineStyle?: LineStyle;
  value?: string;
  textStyle?: TextStyle;
  x1?: number;
  x2?: number;
  y1?: number;
  y2?: number;
}

export interface Option {
  Nodes: Node[];
  Links: Link[];
  SvgID: string;
  Width?: number;
  Height?: number;
  Scale?: number;
  TranslateX?: number;
  TranslateY?: number;
  onNodeClick?: (Graph, Node) => void;
  onNodeMouseOver?: (Graph, Node) => void;
  onNodeMouseOut?: (Graph, Node) => void;
  onBGMouseOver?: (Graph, any) => void;
}

export const DefaultItemStyle: ItemStyle = {
  radius: 20,
  fill: '#acf',
  stroke: '#000',
  cx: '0',
  cy: '0',
  width: '20',
  height: '20'
};

export const DefaultLineStyle: LineStyle = {
  stroke: '#000',
  strokeWidth: '1',
  strokeOpacity: '1',
  markerEnd: 'url(#marker-arrow)'
};

export const DefaultTextStyle: TextStyle = {
  fontSize: '15',
  dx: '23',
  dy: '4'
};

export class Graph {
  // origin data
  baseNodes: Node[];
  baseLinks: Link[];

  // tweaked data
  nodes: Node[];
  links: Link[];

  width: number = 960;
  height: number = 600;
  alphatarget: number = 0.5;

  // root selection
  svg;

  // use svg groups to logically group the elements together
  linkGroup;
  nodeGroup;
  textGroup;

  // simulation setup with all forces
  linkForce;
  simulation;
  dragDrop;

  // opacity when trigger hover fade
  fadeOpacity: number = 0.2;
  opts: Option;

  static cloneLink(l: Link) {
    return Object.keys(l).reduce((clone, key) => {
      clone[key] = l[key];
      return clone;
    }, {}) as Link;
  }
  static cloneNode(n: Node) {
    return Object.keys(n).reduce((clone, key) => {
      clone[key] = n[key];
      return clone;
    }, {}) as Node;
  }
  static getDefaultItemStyle(n: Node): Node {
    if (n.itemStyle) {
      Object.keys(DefaultItemStyle).forEach(
        key =>
          n.itemStyle[key] ? null : (n.itemStyle[key] = DefaultItemStyle[key])
      );
    } else {
      n.itemStyle = DefaultItemStyle;
    }
    return n;
  }
  static getDefaultTextStyle(n: Node | Link): Node | Link {
    if (n.textStyle) {
      Object.keys(DefaultTextStyle).forEach(
        key =>
          n.textStyle[key] ? null : (n.textStyle[key] = DefaultTextStyle[key])
      );
    } else {
      n.textStyle = DefaultTextStyle;
    }
    return n;
  }
  static getDefaultLineStyle(l: Link): Link {
    if (l.lineStyle) {
      Object.keys(DefaultLineStyle).forEach(
        key =>
          l.lineStyle[key] ? null : (l.lineStyle[key] = DefaultLineStyle[key])
      );
    } else {
      l.lineStyle = DefaultLineStyle;
    }
    return l;
  }

  constructor(opt: Option) {
    const self = this;
    this.opts = opt;
    this.baseLinks = opt.Links.map(
      l =>
        Graph.getDefaultTextStyle(
          Graph.getDefaultLineStyle(Graph.cloneLink(l))
        ) as Link
    );
    this.baseNodes = opt.Nodes.map(
      n =>
        Graph.getDefaultTextStyle(
          Graph.getDefaultItemStyle(Graph.cloneNode(n))
        ) as Node
    );
    this.nodes = opt.Nodes.map(
      n =>
        Graph.getDefaultTextStyle(
          Graph.getDefaultItemStyle(Graph.cloneNode(n))
        ) as Node
    );
    this.links = opt.Links.map(
      l =>
        Graph.getDefaultTextStyle(
          Graph.getDefaultLineStyle(Graph.cloneLink(l))
        ) as Link
    );

    const svg = d3.select(opt.SvgID);
    this.svg = svg;

    svg
      .data(['end'])
      .enter()
      .append('svg:marker')
      .attr('width', this.width)
      .attr('height', this.height);

    this.buildMarkers();

    const root = svg.append('g');

    const bg = root
      .append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', 'rgba(0,0,0,0)')
      .on(
        'mouseover',
        bg =>
          this.opts.onBGMouseOver ? this.opts.onBGMouseOver(this, bg) : null
      );

    this.textGroup = root.append('g').attr('class', 'texts');
    this.linkGroup = root.append('g').attr('class', 'links');
    this.nodeGroup = root.append('g').attr('class', 'nodes');

    const zoom = d3.zoom().on('zoom', () => {
      self.linkGroup.attr('transform', d3.event.transform);
      self.nodeGroup.attr('transform', d3.event.transform);
      self.textGroup.attr('transform', d3.event.transform);
    });

    // append a background rect, so that mouse wheel zoom can be activated on all areas
    root.call(zoom);

    // set inital zoom
    if (opt.Scale) {
      root.call(zoom.transform, d3.zoomIdentity.scale(opt.Scale));
    }
    if (
      opt.TranslateX !== undefined &&
      opt.TranslateY !== undefined &&
      opt.Scale
    ) {
      root.call(
        zoom.transform,
        d3.zoomIdentity
          .translate(opt.TranslateX, opt.TranslateY)
          .scale(opt.Scale)
      );
    }

    this.linkForce = d3
      .forceLink()
      .id(node => (node as Node).id)
      .strength((link: Link) => link.strength);

    // get real width and height
    const { width, height } = (root.node() as any).getBBox();
    if (opt.Width) {
      this.width = opt.Width;
    } else {
      this.width = width;
    }
    if (opt.Height) {
      this.height = opt.Height;
    } else {
      this.height = height;
    }

    bg.attr('width', width).attr('height', height);

    this.simulation = d3
      .forceSimulation()
      .force('link', this.linkForce)
      .force('charge', d3.forceManyBody())
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => 80));
    this.dragDrop = d3
      .drag()
      .on('start', function(node: any) {
        node.fx = node.x;
        node.fy = node.y;
      })
      .on('drag', function(node: any) {
        self.simulation.alphaTarget(self.alphatarget).restart();
        node.fx = d3.event.x;
        node.fy = d3.event.y;
      })
      .on('end', function(node: any) {
        if (!d3.event.active) {
          self.simulation.alphaTarget(0);
        }
        node.fx = null;
        node.fy = null;
      });
  }

  // build the arrow.
  buildMarkers() {
    this.svg
      .append('svg:defs')
      .selectAll('marker')
      .data(['end'])
      .enter()
      .append('svg:marker')
      .attr('id', 'marker-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 10)
      .attr('refY', -0.5)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('svg:path')
      .attr('d', 'M0,-5L10,0L0,5');
  }

  getNeighbors(node: Node): string[] {
    return this.baseLinks.reduce(
      function(neighbors, link) {
        if (link.target === node.id) {
          neighbors.push(link.source);
        } else if (link.source === node.id) {
          neighbors.push(link.target);
        }
        return neighbors;
      },
      [node.id]
    );
  }

  static unselectNode(g: Graph, selectedNode: Node) {
    g.nodeGroup.selectAll('circle').attr('opacity', 1);
    g.linkGroup.selectAll('g').attr('opacity', 1);
    g.textGroup.selectAll('g').attr('opacity', 1);
  }

  // select node is called on every click
  static selectNode(g: Graph, selectedNode: Node) {
    const neighbors = g.getNeighbors(selectedNode);
    const neighborsMap = neighbors.reduce((map, n) => {
      map[n] = true;
      return map;
    }, {});

    // we modify the styles to highlight selected nodes
    g.nodeGroup.selectAll('circle').attr('opacity', function(node) {
      if (!neighborsMap[node.id]) {
        return (node as Node).itemStyle.opacity;
      } else {
        (node as Node).itemStyle.opacity = '1';
        return (node as Node).itemStyle.opacity;
      }
    });
    g.textGroup.selectAll('text').attr('opacity', function(node) {
      if (!neighborsMap[node.id]) {
        return (node as Node).textStyle.opacity;
      } else {
        (node as Node).textStyle.opacity = '1';
        return (node as Node).textStyle.opacity;
      }
    });
    g.linkGroup.selectAll('line').attr('opacity', function(link) {
      if (neighborsMap[link.source.id] && link.source.id === neighbors[0]) {
        (link as Link).lineStyle.opacity = '1';
        return (link as Link).lineStyle.opacity;
      } else if (
        neighborsMap[link.target.id] &&
        link.target.id === neighbors[0]
      ) {
        (link as Link).lineStyle.opacity = '1';
        return (link as Link).lineStyle.opacity;
      } else {
        return (link as Link).lineStyle.opacity;
      }
    });
  }

  static addCommonAttr(d3Selection) {
    return d3Selection
      .attr('stroke', node => (node as Node).itemStyle.stroke)
      .attr('fill', node => (node as Node).itemStyle.fill)
      .attr('stroke-width', node => (node as Node).itemStyle.strokeWidth)
      .attr('stroke-opacity', node => (node as Node).itemStyle.strokeOpacity)
      .attr('fill-opacity', node => (node as Node).itemStyle.fillOpacity)
      .attr('opacity', node => (node as Node).itemStyle.opacity);
  }

  static makeCircleNode(d3Selection) {
    return Graph.addCommonAttr(
      d3Selection
        .append(NodeType.circle)
        .attr('id', node => (node as Node).id)
        .attr('r', node => (node as Node).itemStyle.radius)
        .attr('cx', node => (node as Node).itemStyle.cx)
        .attr('cy', node => (node as Node).itemStyle.cy)
    );
  }

  static makeLink(d3Selection) {
    return d3Selection
      .append('line')
      .attr('stroke', link => (link as Link).lineStyle.stroke)
      .attr('stroke-width', link => (link as Link).lineStyle.strokeWidth)
      .attr('marker-start', link => (link as Link).lineStyle.markerStart)
      .attr('marker-end', link => (link as Link).lineStyle.markerEnd)
      .attr('stroke-opacity', link => (link as Link).lineStyle.strokeOpacity)
      .attr('opacity', link => (link as Link).lineStyle.opacity);
  }

  static makeLinkWithLabel(d3Selection) {
    const s = d3Selection.append('g');
    Graph.makeLink(s);
    s.append('rect')
      .attr('width', link => ((link as Link).value ? 40 : 0))
      .attr('height', link => ((link as Link).value ? 30 : 0))
      .attr('fill', 'white')
      .attr('x', 0)
      .attr('y', 0);
    return s
      .append('text')
      .text(link => (link as Link).value)
      .attr('dx', link => 0)
      .attr('dy', link => 0)
      .attr('font-size', link => (link as Link).textStyle.fontSize)
      .attr('font-family', link => (link as Link).textStyle.fontFamily)
      .attr('stroke', link => (link as Link).textStyle.stroke)
      .attr('fill', link => (link as Link).textStyle.fill)
      .attr('opacity', link => (link as Link).textStyle.opacity)
      .attr(
        'text-anchor',
        link => (link as Link).textStyle.textAnchor || 'middle'
      );
  }

  static makeText(d3Selection) {
    return d3Selection
      .append('text')
      .text(node => (node as Node).name)
      .attr('dx', node => (node as Node).textStyle.dx)
      .attr('dy', node => (node as Node).textStyle.dy)
      .attr('font-size', node => (node as Node).textStyle.fontSize)
      .attr('font-family', node => (node as Node).textStyle.fontFamily)
      .attr('stroke', node => (node as Node).textStyle.stroke)
      .attr('fill', node => (node as Node).textStyle.fill)
      .attr('opacity', node => (node as Node).textStyle.opacity)
      .attr('text-anchor', node => (node as Node).textStyle.textAnchor);
  }

  updateGraph() {
    Graph.makeText(
      this.textGroup
        .selectAll('text')
        .data(this.nodes, n => n.id)
        .enter()
    );

    Graph.makeLinkWithLabel(
      this.linkGroup
        .selectAll('line')
        .data(this.links, l => l.target.id + l.source.id)
        .enter()
    );

    const nodeEnter = Graph.makeCircleNode(
      this.nodeGroup
        .selectAll('circle')
        .data(this.nodes, n => n.id)
        .enter()
    );
    nodeEnter
      .call(this.dragDrop)
      // highlight neibor nodes and links
      .on(
        'click',
        selectNode =>
          this.opts.onNodeClick ? this.opts.onNodeClick(this, selectNode) : null
      )
      .on(
        'mouseout',
        selectNode =>
          this.opts.onNodeMouseOut
            ? this.opts.onNodeMouseOut(this, selectNode)
            : null
      )
      .on(
        'mouseover',
        selectNode =>
          this.opts.onNodeMouseOver
            ? this.opts.onNodeMouseOver(this, selectNode)
            : null
      );
  }

  updateSimulation() {
    this.updateGraph();

    const self = this;
    this.simulation.nodes(this.nodes).on('tick', () => {
      self.nodeGroup
        .selectAll('circle')
        .attr('cx', function(node) {
          return node.x;
        })
        .attr('cy', function(node) {
          return node.y;
        });
      self.textGroup
        .selectAll('text')
        .attr('x', function(node) {
          return (
            node.x +
            ((node.itemStyle.radius - 20) / node.itemStyle.radius) *
              node.itemStyle.radius
          );
        })
        .attr('y', function(node) {
          return node.y;
        });

      // Use paper.js to calculate link ends, point to the circle edge instead of center
      self.linkGroup
        .selectAll('line')
        .attr('x1', function(link) {
          const { x: x1, y: y1 } = link.source;
          const { x: x2, y: y2 } = link.target;
          let v = new paper.Point(x2 - x1, y2 - y1);
          v = v.normalize(link.target.itemStyle.radius);
          return link.source.x + v.x;
        })
        .attr('y1', function(link) {
          const { x: x1, y: y1 } = link.source;
          const { x: x2, y: y2 } = link.target;
          let v = new paper.Point(x2 - x1, y2 - y1);
          v = v.normalize(link.target.itemStyle.radius);
          return link.source.y + v.y;
        })
        .attr('x2', function(link) {
          const { x: x1, y: y1 } = link.source;
          const { x: x2, y: y2 } = link.target;
          let v = new paper.Point(x2 - x1, y2 - y1);
          v = v.normalize(link.target.itemStyle.radius);
          return link.target.x - v.x;
        })
        .attr('y2', function(link) {
          const { x: x1, y: y1 } = link.source;
          const { x: x2, y: y2 } = link.target;
          let v = new paper.Point(x2 - x1, y2 - y1);
          v = v.normalize(link.target.itemStyle.radius);
          return link.target.y - v.y;
        });
      self.linkGroup
        .selectAll('text')
        .attr('dx', function(link) {
          return (link.source.x + link.target.x) / 2;
        })
        .attr('dy', function(link) {
          return (link.source.y + link.target.y) / 2;
        });
      self.linkGroup
        .selectAll('rect')
        .attr('x', function(link) {
          return (link.source.x + link.target.x) / 2 - 20;
        })
        .attr('y', function(link) {
          return (link.source.y + link.target.y) / 2 - 20;
        });
    });

    self.simulation.force('link').links(self.links);
    self.simulation.alphaTarget(self.alphatarget).restart();
  }

  destroy() {
    this.linkGroup.exit().remove();
    this.nodeGroup.exit().remove();
    this.textGroup.exit().remove();
    this.simulation.stop();
    this.svg.selectAll('*').remove();
  }
}
