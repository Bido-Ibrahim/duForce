// config.js
export const config = {
  // Mutable constants
  initialLoadComplete: false,
  expandedTreeData: {}, // stored for collapseAll button
  collapsedTreeData: {},
  currentTreeData: {}, // current tree expansion status
  tier1And2Mapper: {},
  selectedNodeNames: [],
  subModules: [],
  currentLayout: "default",
  showSingleNodes: true,
  showArrows: false,
  // Method to update the nodes array
  setTier1And2Mapper(newObject) {
    if (typeof newObject === "object") {
      this.tier1And2Mapper = newObject;
    } else {
      console.error("Expected an array for tier1And2Mapper.");
    }
  },
  setCollapsedTreeData(newObject) {
    if (typeof newObject === "object") {
      this.collapsedTreeData = newObject;
    } else {
      console.error("Expected an array for collapsedTreeData.");
    }
  },
  setExpandedTreeData(newObject) {
    if (typeof newObject === "object") {
      this.expandedTreeData = newObject;
    } else {
      console.error("Expected an array for expandedTreeData.");
    }
  },
  setCurrentTreeData(newObject) {
    if (typeof newObject === "object") {
      this.currentTreeData = newObject;
    } else {
      console.error("Expected an array for currentTreeData.");
    }
  },
  setSubModules(newArray) {
    if (Array.isArray(newArray)) {
      this.subModules = newArray;
    } else {
      console.error("Expected an array for setSelectedNodeName.");
    }
  },
  setSelectedNodeNames(newArray) {
    if (Array.isArray(newArray)) {
      this.selectedNodeNames = newArray;
    } else {
      console.error("Expected an array for setSelectedNodeName.");
    }
  },

  addToSelectedNodeNames(newName) {
    if (typeof newName === 'string') {
      if(!this.selectedNodeNames.some((s) => s === newName)){
        this.selectedNodeNames.push(newName);
      }
    } else {
      console.error("Expected an array for setSelectedNodeName.");
    }
  },


  // Method to update the layout type
  setCurrentLayout(newLayout) {
    if (typeof newLayout === 'string') {
      this.currentLayout = newLayout;
    } else {
      console.error("Expected a string for currentLayout.");
    }
  },


  // Method to set the showSingle explicitly
  setShowSingleNodes(value) {
    if (typeof value === 'boolean') {
      this.showSingleNodes = value;
    } else {
      console.error("Expected a boolean for showSingleNodes.");
    }
  },

  // Method to set the showSingle explicitly
  setShowArrows(value) {
    if (typeof value === 'boolean') {
      this.showArrows = value;
    } else {
      console.error("Expected a boolean for showArrows.");
    }
  },

  // Method to set the showSingle explicitly
  setInitialLoadComplete(value) {
    if (typeof value === 'boolean') {
      this.initialLoadComplete = value;
    } else {
      console.error("Expected a boolean for initialLoadComplete.");
    }
  }
};
