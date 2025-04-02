// config.js
export const config = {
  // Mutable constants
  currentLayout: "default",
  showSingleNodes: true,
  showArrows: false,
  initialLoadComplete: false,
  parameterData: {},
  hierarchyData: {},
  allNodeNames: [],
  expandedTreeData: {}, // stored for collapseAll button
  collapsedTreeData: {},
  currentTreeData: {}, // current tree expansion status
  tier1And2Mapper: {},
  subModules: [],
  selectedNodeNames: [],
  defaultNodePositions:[],
  notDefaultSelectedNodeNames: [],
  notDefaultSelectedLinks: [],
  nearestNeighbourOrigin: "",
  nearestNeighbourDegree: 1,
  shortestPathStart: "",
  shortestPathEnd: "",
  allCategoryHierarchy: {},
  currentCategoryHierarchy: {},
  setHierarchyData(newObject) {
    if (typeof newObject === "object") {
      this.hierarchyData = newObject;
    } else {
      console.error("Expected an array for hierarchyData.");
    }
  },
  setParameterData(newObject) {
    if (typeof newObject === "object") {
      this.parameterData = newObject;
    } else {
      console.error("Expected an array for parameterData.");
    }
  },
  setAllCategoryHierarchy(newObject) {
    if (typeof newObject === "object") {
      this.allCategoryHierarchy = newObject;
    } else {
      console.error("Expected an array for collapsedCategoryHierarchy.");
    }
  },
  setCurrentCategoryHierarchy(newObject) {
    if (typeof newObject === "object") {
      this.currentCategoryHierarchy = newObject;
    } else {
      console.error("Expected an array for currentCategoryHierarchy.");
    }
  },
  // Method to update the nodes array
  setTier1And2Mapper(newObject) {
    if (typeof newObject === "object") {
      this.tier1And2Mapper = newObject;
    } else {
      console.error("Expected an array for tier1And2Mapper.");
    }
  },
  setAllNodeNames(newObject) {
    if (typeof newObject === "object") {
      this.allNodeNames = newObject;
    } else {
      console.error("Expected an array for allNodeNames.");
    }
  },
  setNearestNeighbourDegree(newNumber) {
    if (typeof +newNumber === "number") {
      this.nearestNeighbourDegree = +newNumber;
    } else {
      console.error("Expected an array for nearestNeighbourDegree.");
    }
  },
  setDefaultNodePositions(newObject) {
    if (typeof newObject === "object") {
      this.defaultNodePositions = newObject;
    } else {
      console.error("Expected an array for defaultNodePositions.");
    }
  },
  setNotDefaultSelectedLinks(newObject) {
    if (typeof newObject === "object") {
      this.notDefaultSelectedLinks = newObject;
    } else {
      console.error("Expected an array for notDefaultSelectedLinks.");
    }
  },
  setNearestNeighbourOrigin(newNodeName) {
    if (typeof newNodeName === "string") {
      this.nearestNeighbourOrigin = newNodeName;
    } else {
      console.error("Expected an array for nearestNeighbourOrigin.");
    }
  },
  setShortestPathStart(newNodeName) {
    if (typeof newNodeName === "string") {
      this.shortestPathStart = newNodeName;
    } else {
      console.error("Expected an array for shortestPathStart.");
    }
  },
  setShortestPathEnd(newNodeName) {
    if (typeof newNodeName === "string") {
      this.shortestPathEnd = newNodeName;
    } else {
      console.error("Expected an array for shortestPathEnd.");
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
  setNotDefaultSelectedNodeNames(newArray) {
    if (Array.isArray(newArray)) {
      this.notDefaultSelectedNodeNames = newArray;
    } else {
      console.error("Expected an array for notDefaultSelectedNodeNames.");
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
