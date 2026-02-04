import type { Node } from '@xyflow/react';

interface CollisionAlgorithmOptions {
  /** @default 50 */
  maxIterations?: number;
  /** @default 0.5 */
  overlapThreshold?: number;
  /** @default 10 */
  margin?: number;
}

type CollisionAlgorithm = (nodes: Node[], options?: CollisionAlgorithmOptions) => Node[];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  moved: boolean;
  node: Node;
}

function getBoxesFromNodes(nodes: Node[], margin = 0): Box[] {
  return nodes.map((node) => {
    const width = node.width ?? node.measured?.width ?? 0;
    const height = node.height ?? node.measured?.height ?? 0;

    return {
      x: node.position.x - margin,
      y: node.position.y - margin,
      width: width + margin * 2,
      height: height + margin * 2,
      node,
      moved: false,
    };
  });
}

/**
 * Based on Node Collisions Reactflow example
 *
 * @see https://reactflow.dev/examples/layout/node-collisions
 */
export const resolveCollisions: CollisionAlgorithm = (
  nodes,
  { maxIterations = 50, overlapThreshold = 0.5, margin = 10 } = {}
) => {
  const boxes = getBoxesFromNodes(nodes, margin);

  for (let iter = 0; iter <= maxIterations; iter++) {
    let moved = false;

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i];
        const B = boxes[j];

        // Calculate center positions
        const centerAX = A.x + A.width * 0.5;
        const centerAY = A.y + A.height * 0.5;
        const centerBX = B.x + B.width * 0.5;
        const centerBY = B.y + B.height * 0.5;

        // Calculate distance between centers
        const dx = centerAX - centerBX;
        const dy = centerAY - centerBY;

        // Calculate overlap along each axis
        const px = (A.width + B.width) * 0.5 - Math.abs(dx);
        const py = (A.height + B.height) * 0.5 - Math.abs(dy);

        // Check if there's significant overlap
        if (px > overlapThreshold && py > overlapThreshold) {
          A.moved = B.moved = moved = true;
          // Resolve along the smallest overlap axis
          if (px < py) {
            // Move along x-axis
            const sx = dx > 0 ? 1 : -1;
            const moveAmount = (px / 2) * sx;
            A.x += moveAmount;
            B.x -= moveAmount;
          } else {
            // Move along y-axis
            const sy = dy > 0 ? 1 : -1;
            const moveAmount = (py / 2) * sy;
            A.y += moveAmount;
            B.y -= moveAmount;
          }
        }
      }
    }
    // Early exit if no overlaps were found
    if (!moved) {
      break;
    }
  }

  const newNodes = boxes.map((box) => {
    if (box.moved) {
      return {
        ...box.node,
        position: {
          x: box.x + margin,
          y: box.y + margin,
        },
      };
    }
    return box.node;
  });

  return newNodes;
};
