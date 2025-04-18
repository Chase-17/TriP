import './assets/main.css'
import '../node_modules/flowbite-vue/dist/index.css'

import { createApp } from 'vue'
import { ref, watch, reactive } from 'vue';
import App from './App.vue'
import router from './router'
import { Icon } from '@iconify/vue';
import 'uno.css'
import { 
    FwbDropdown, FwbListGroup, FwbListGroupItem,
    FwbToggle, FwbTab, FwbTabs,
    FwbButton, FwbModal, FwbRange, 
    FwbInput,  FwbTooltip, FwbA, FwbTable,
    FwbTableBody, FwbTableCell, FwbTableHead,
    FwbTableHeadCell, FwbTableRow, FwbAccordion,
    FwbAccordionContent, FwbAccordionHeader, FwbAccordionPanel,
    FwbSelect, FwbTextarea
 } from 'flowbite-vue'
import DiceBox from "@3d-dice/dice-box-threejs";
 
const app = createApp(App)

app.use(router)
app.config.globalProperties.$expandText = (text) => {
    while (text.match(/:\w+/g)!=null) {
        text = text.replace(/:\w+/, "<ic-$&></ic-$&>")
        .replace("<ic-:", "<ic-")
        .replace("</ic-:", "</ic-");
    }
    if (!text.includes("\n")) text = "\n"+text;
    text = text.replace("\n", "<p det>");
    text = text + "</p>";
    return text;
};
app.config.globalProperties.$randomInt = (min, max) => {
    return Math.floor(min + Math.random()*(1 + max-min));
};
app.config.globalProperties.$updateChars = (chars) => {
    localStorage.setItem("CHARS", JSON.stringify(chars));
};
app.config.globalProperties.$attrToChecks = (atr) => {
    let names = ['attack', 'order', 'impact', 'defence', 'chaos', 'research'];
    let result = {};
    let values = Object.values(atr);
    let len = values.length;
    Object.entries(atr).forEach(([key, value], index) => {
        let clockvise = values[(index + 1) % len];
        let counterclock = values[(index + len - 1) % len];
        let opposite = values[(index + 3) % len];
        console.log(`${names[index]}: ${clockvise}, ${counterclock}, ${opposite}`);
        result[names[index]] = Math.max((value + Math.floor((clockvise + counterclock)/2)),
                                         Math.floor(opposite / 2));
    });
    return result;
}

let $DICE = new DiceBox("#dice-canvas", {
    theme_customColorset: {
      // background: [
      //   "#00ffcb",
      //   "#ff6600",
      //   "#1d66af",
      //   "#7028ed",
      //   "#c4c427",
      //   "#d81128"
      // ], // randomly assigned colors
      background: "#ffff00",
      foreground: "#ffffff",
      texture: "marble", // marble | ice
      material: "metal" // metal | glass | plastic | wood
    },
    light_intensity: 2,
    gravity_multiplier: 300,
    baseScale: 150,
    strength: 25,
    onRollComplete: (results) => {
    }
  });
  
let dicebox = document.getElementById('dice-canvas');
  $DICE.initialize()
    .then(() => {
        dicebox.classList.remove('top-[50%]')
        dicebox.classList.add('top-[150%]')
        dicebox.classList.remove('-z-50')
        dicebox.classList.add('z-50')
    })
    .catch((e) => console.error(e));
    $DICE.updateConfig({
      theme_customColorset: {
        background: "#ff0000",
        foreground: "#ffffff",
        texture: "ice", // marble | ice
        material: "metal" // metal | glass | plastic | wood
      }
    });
  
app.config.globalProperties.$initiateRoll = async (options) => {
    let expr = options.expr ?? `1d12`;
    dicebox.classList.remove('top-[150%]');
    dicebox.classList.add('top-[50%]');
    let result = await $DICE.roll(
      expr,
    ).then((e)=> {
        dicebox.classList.remove('top-[50%]');
        dicebox.classList.add('top-[150%]');
        return e;
    });
    return result;
  },

app.config.globalProperties.$CHARS = ref({});
// app.config.globalProperties.$CHARS_REACTIVE = reactive({computed: {}});


app.component('Icon', Icon)
app.component('fwb-dropdown', FwbDropdown)
app.component('fwb-list-group', FwbListGroup)
app.component('fwb-list-group-item', FwbListGroupItem)
app.component('fwb-toggle', FwbToggle)
app.component('fwb-tab', FwbTab)
app.component('fwb-tabs', FwbTabs)
app.component('fwb-modal', FwbModal)
app.component('fwb-button', FwbButton)
app.component('fwb-range', FwbRange)
app.component('fwb-input', FwbInput)
app.component('fwb-tooltip', FwbTooltip)
app.component('fwb-a', FwbA)
app.component('fwb-table', FwbTable)
app.component('fwb-table-body', FwbTableBody)
app.component('fwb-table-cell', FwbTableCell)
app.component('fwb-table-head', FwbTableHead)
app.component('fwb-table-head-cell', FwbTableHeadCell)
app.component('fwb-table-row', FwbTableRow)
app.component('fwb-accordion', FwbAccordion)
app.component('fwb-accordion-content', FwbAccordionContent)
app.component('fwb-accordion-header', FwbAccordionHeader)
app.component('fwb-accordion-panel', FwbAccordionPanel)
app.component('fwb-select', FwbSelect)
app.component('fwb-textarea', FwbTextarea)

app.mount('#app')
