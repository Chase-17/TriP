<script setup>
import { RouterLink, RouterView } from 'vue-router'
import HelloWorld from './components/HelloWorld.vue'
import * as d3 from "d3";
import * as $GLOB from './assets/globals.js';
import { ref, watch, reactive } from 'vue';
import { initFlowbite } from 'flowbite'

</script>

<script>
export default {
  data: () => ({
    detail_levels: [
      {
        id: 'more_details',
        text: 'Подробно',
        icon: 'mdi:text-long',
      },
      {
        id: 'med_details',
        text: 'Средне',
        icon: 'mdi:text',
      },
      {
        id: 'no_details',
        text: 'Коротко',
        icon: 'mdi:text-short',
      },
    ],
    detail_level: 1,
    dicebox_shown: true,
    isRed: false,
    my_characters: reactive([]),
    char_chosen: 0,
    state: 'overview',
    editor_step: 0,
    male_gender: true,
    editor_char_name: "",
    classSelected: {},
    classSelectedKey: "",
    raceSelected: {},
    raceSelectedKey: "",
    character_selected: null,
    editor_traits_chosen: {
      first: {},
      second: {},
      third: {},
    },
    chosenClass: {},
    editorAttrs: {
      might: 0,
      reason: 0,
      charisma: 0,
      trickery: 0,
      intuition: 0,
      perception: 0,
    },
    race: null,
    aspects: [],
    attrs: {
      might: 0,
      reason: 0,
      charisma: 0,
      trickery: 0,
      intuition: 0,
      perception: 0,
    },
    skillpoints: 10,
    hp_type: 'simple',
    max_hp: 8,
    max_steps: 4,
    curr_hp: 8,
    editorActive: true,
    equips: {
      first: {
        name: "Ближний бой",
        attack: 0,
        defence_melee: 0,
        defence_ranged: 0,
        attacks: [
          {score: 3, text: "лёгкий урон"},
          {score: 6, text: "точный удар"},
          {score: 9, text: "тяжёлый урон"},
          {score: 12, text: "мощный точный удар"},
          {score: 18, text: "сокрушительный удар"},
        ],
        notes: [
          "Пробивает броню",
          "Красиво выглядит"
        ]
      }, 
      second: {
        name: "Дальний бой",
        attack: 0,
        defence_melee: 0,
        defence_ranged: 0,
        attacks: [
          {score: 3, text: "лёгкий урон"},
          {score: 6, text: "точный удар"},
          {score: 9, text: "тяжёлый урон"},
          {score: 12, text: "мощный точный удар"},
          {score: 18, text: "сокрушительный удар"},
        ],
        notes: [
          "Пробивает броню",
          "Полное действие на перезарядку"
        ]
      }
    },
    equip_chosen: "first",
    characterToEdit: {},
    characterToEditIndex: null,
  }),
  computed: {
    gender() {
      if (this.male_gender) return 'm';
      else return 'f';
    },
    checks() {
      let obj = {};
      if (this.character_selected == null) return {};
      obj.attack    = this.currentChar.attrs.might        + Math.floor((this.currentChar.attrs.reason     + this.currentChar.attrs.perception)/2);
      obj.order     = this.currentChar.attrs.reason       + Math.floor((this.currentChar.attrs.might      + this.currentChar.attrs.charisma)/2);
      obj.impact    = this.currentChar.attrs.charisma     + Math.floor((this.currentChar.attrs.reason     + this.currentChar.attrs.trickery)/2);
      obj.defence   = this.currentChar.attrs.trickery     + Math.floor((this.currentChar.attrs.charisma   + this.currentChar.attrs.intuition)/2);
      obj.sabotage  = this.currentChar.attrs.intuition    + Math.floor((this.currentChar.attrs.trickery   + this.currentChar.attrs.perception)/2);
      obj.research  = this.currentChar.attrs.perception   + Math.floor((this.currentChar.attrs.intuition  + this.currentChar.attrs.might)/2);
      return obj;
    },
    editorChecks() {
      let obj = {};
      obj.attack    = this.editorAttrs.might        + Math.floor((this.editorAttrs.reason     + this.editorAttrs.perception)/2);
      obj.order     = this.editorAttrs.reason       + Math.floor((this.editorAttrs.might      + this.editorAttrs.charisma)/2);
      obj.impact    = this.editorAttrs.charisma     + Math.floor((this.editorAttrs.reason     + this.editorAttrs.trickery)/2);
      obj.defence   = this.editorAttrs.trickery     + Math.floor((this.editorAttrs.charisma   + this.editorAttrs.intuition)/2);
      obj.sabotage  = this.editorAttrs.intuition    + Math.floor((this.editorAttrs.trickery   + this.editorAttrs.perception)/2);
      obj.research  = this.editorAttrs.perception   + Math.floor((this.editorAttrs.intuition  + this.editorAttrs.might)/2);
      return obj;
    },
    defence() {
      let obj = {};
      obj.melee_front = $GLOB.check_diffs[Math.floor((this.currentChar.checks.defence + this.currentChar.armor_defence + this.currentChar.equips[this.currentChar.equip_chosen].defence_melee)/3)*3 + 6];
      obj.ranged_front = $GLOB.check_diffs[Math.floor((this.currentChar.checks.defence + this.currentChar.armor_defence + this.currentChar.equips[this.currentChar.equip_chosen].defence_ranged)/3)*3 + 6];
      obj.melee_side = $GLOB.check_diffs[Math.floor((this.currentChar.checks.defence + this.currentChar.armor_defence + this.currentChar.equips[this.currentChar.equip_chosen].defence_melee/2)/3)*3 + 3]
      obj.ranged_side = $GLOB.check_diffs[Math.floor((this.currentChar.checks.defence + this.currentChar.armor_defence + this.currentChar.equips[this.currentChar.equip_chosen].defence_ranged/2)/3)*3 + 3]
      obj.melee_back = $GLOB.check_diffs[Math.floor((this.currentChar.checks.defence/2 + this.currentChar.armor_defence)/3)*3]
      obj.ranged_back = $GLOB.check_diffs[Math.floor((this.currentChar.checks.defence/2 + this.currentChar.armor_defence)/3)*3]
      return obj;
    },
    check_diffs_structured() {
      let result = [];
      $GLOB.check_diffs_structure.forEach(element => {
        let temp = element;
        // temp.sub = [];
        temp.subcat = [];
        let cat_class = "";
        Object.entries(element.sub).forEach(([key, value]) => {
          let obj = {
            label: key,
            number: value,
            name: $GLOB.check_diffs[value].name,
            short: $GLOB.check_diffs[value].short,
            class: $GLOB.check_diffs[value].class,
          }
          temp.subcat.push(obj);
          if (key == "") cat_class = obj.class;
        })
        temp.class = cat_class;
        result.push(temp)
      });
      return result;
    }, 
    currentChar() {
      if (this.character_selected == null) return {};
      else {
        return this.my_characters[this.character_selected];
      }
    },
    skillpointsTotal() {
      return (this.characterToEdit.level - 1)*4;
    },
    skillpointsFree() {
      return this.skillpointsTotal - this.characterToEdit.skillpointsUsed;
    },
    traitsAvailable() {
      let traits = [];
      Object.entries($GLOB.aspects).forEach(([key, value]) => {
        if (this.characterToEdit.aspects.includes(key))
          traits.push(value.traits);
      });
      return traits;
    }
  },
  methods: {
    modifyAttr(attr_name, value) {
      if (this.editorActive) {
        this.attrs[attr_name] += value;
        this.skillpoints -= value * 2;
      }
    },
  scrollToTop() {
    window.scrollTo(0,0);
  },
    chooseEquip(name) {
      this.my_characters[this.character_selected].equip_chosen = name;
    },
    nextEditorStep() {
      this.editor_step += 1;
      this.scrollToTop();
    },
    prevEditorStep() {
      if (this.editor_step - 1 > 0) this.editor_step -= 1;
      this.scrollToTop();
    },
    classSelect(ch_class, key) {
      this.editor_step = 4;
      this.classSelected = ch_class;
      this.classSelectedKey = key;
      this.scrollToTop();
    },
    raceSelect(race, key) {
      this.editor_step = 2;
      this.raceSelected = race;
      this.raceSelectedKey = key;
      this.scrollToTop();
    },
    chooseClass() {
      this.nextEditorStep();
      this.chosenClass = this.classSelected;
      this.aspects = this.classSelected.aspects;
      this.editorAttrs= {
        might: 0,
        reason: 0,
        charisma: 0,
        trickery: 0,
        intuition: 0,
        perception: 0,
      },
      this.editorAttrs[$GLOB.aspects[this.aspects[0]].attr] = 6;
      this.editorAttrs[$GLOB.aspects[this.aspects[1]].attr] = 4;
      let attrs = [];
      Object.entries($GLOB.aspects).forEach(([key, value]) => {
        if (key != $GLOB.aspects[this.aspects[0]].opposite 
          && key != $GLOB.aspects[this.aspects[1]].opposite
          && key != $GLOB.aspects[this.aspects[0]].id
          && key != $GLOB.aspects[this.aspects[1]].id) {
            attrs.push(value.attr);
          }
      });
      let value = 4 / attrs.length;
      attrs.forEach(attr => {
        this.editorAttrs[attr] = value;
      })
    },
    chooseRace(type, max_hp, max_steps) {
      this.race = type;
      this.max_hp = max_hp;
      this.max_steps = max_steps;
      this.curr_hp = max_hp;
    },
    swapStrongestAttributes() {
      let replace = this.editorAttrs[$GLOB.aspects[this.aspects[0]].attr];
      this.editorAttrs[$GLOB.aspects[this.aspects[0]].attr] 
        = this.editorAttrs[$GLOB.aspects[this.aspects[1]].attr];
      this.editorAttrs[$GLOB.aspects[this.aspects[1]].attr] = replace;
    },
    wound(value) {
      this.my_characters[this.character_selected].curr_hp -= value;
      if (this.my_characters[this.character_selected].curr_hp < 0)
        this.my_characters[this.character_selected].curr_hp = 0;
    },
    heal(value) {
      this.my_characters[this.character_selected].curr_hp += value;
      if (this.my_characters[this.character_selected].curr_hp > this.my_characters[this.character_selected].max_hp)
        this.my_characters[this.character_selected].curr_hp = this.my_characters[this.character_selected].max_hp;
    },
    startCharCreation() {
      this.state = 'char_creation';
      this.editor_step = 1;
    },
    finishCharCreation() {
      let character = {
        name: this.editor_char_name,
        class: this.classSelected.id,
        classes: [this.classSelected.id],
        aspects: this.aspects,
        gender: this.gender,
        attrs: JSON.parse(JSON.stringify(this.editorAttrs)),
        checks: JSON.parse(JSON.stringify(this.editorChecks)),
        max_hp: this.raceSelected.max_hp,
        curr_hp: this.raceSelected.max_hp,
        equips: JSON.parse(JSON.stringify(this.equips)),
        equip_chosen: this.equip_chosen,
        armor_defence: 0,
        bursts: this.raceSelected.bursts,
        max_bursts: this.raceSelected.bursts,
        armor: this.raceSelected.armor,
        movement: this.raceSelected.movement,
        movement_result: this.raceSelected.movement,
        traits: [this.editor_traits_chosen.first, this.editor_traits_chosen.second, this.editor_traits_chosen.third]
      };
      this.state = 'overview';
      this.my_characters.push(character);
      localStorage.setItem('my_characters', JSON.stringify(this.my_characters));
    },
    deleteCharacter(index) {
      this.my_characters.splice(index, 1);
      this.state = 'overview';
    },
    editCharacter(index) {
      this.characterToEdit = JSON.parse(JSON.stringify(this.my_characters[index]));
      if (typeof this.characterToEdit.level == 'undefined') this.characterToEdit.level = 1;
      if (typeof this.characterToEdit.skillpointsUsed == 'undefined') this.characterToEdit.skillpointsUsed = 0;
      this.characterToEdit.startingAttrs = JSON.parse(JSON.stringify(this.characterToEdit.attrs))
      if (typeof this.characterToEdit.checks == 'undefined') this.characterToEdit.checks = this.getCheckValues(this.characterToEdit.attrs);
      if (typeof this.characterToEdit.movement_result == 'undefined') this.characterToEdit.movement_result = this.characterToEdit.movement;
      this.characterToEditIndex = index;
      this.state = 'character-edit';
    },
    saveEditedCharacter(index) {
      this.characterToEdit.checks = this.getCheckValues(this.characterToEdit.attrs);
      this.my_characters[index] = JSON.parse(JSON.stringify(this.characterToEdit));
      this.state = 'overview';
    },
    selectCharacter(index) {
      this.state = 'character_screen';
      this.character_selected = index;
    },
    turnStarts() {

    },
    turnEnds() {
      this.my_characters[this.character_selected].bursts = this.my_characters[this.character_selected].max_bursts;
    },
    useBurst() {
      this.my_characters[this.character_selected].bursts -= 1;
      if (this.my_characters[this.character_selected].bursts < 0)
      this.my_characters[this.character_selected].bursts = 0;
    },
    setTraitChosen(trait, id) {
      this.editor_traits_chosen[id] = trait;
    },
    increaseAttr(attr) {
      let cost = 4;
      let hasAttrs = [];
      this.characterToEdit.aspects.forEach((asp) => {
        hasAttrs.push($GLOB.aspects[asp].attr)
      });
      if (hasAttrs.includes(attr)) cost = 2;
      if (this.skillpointsFree >= cost) {
        this.characterToEdit.skillpointsUsed += cost;
        this.characterToEdit.attrs[attr] += 1;
      }
      this.characterToEdit.checks = this.getCheckValues(this.characterToEdit.attrs);
    },
    decreaseAttr(attr) {
      let cost = 4;
      let hasAttrs = [];
      this.characterToEdit.aspects.forEach((asp) => {
        hasAttrs.push($GLOB.aspects[asp].attr)
      });
      if (hasAttrs.includes(attr)) cost = 2;
      if (this.characterToEdit.attrs[attr] > this.characterToEdit.startingAttrs[attr]) {
        this.characterToEdit.skillpointsUsed -= cost;
        this.characterToEdit.attrs[attr] -= 1;
      }
      this.characterToEdit.checks = this.getCheckValues(this.characterToEdit.attrs);
    },
    getCheckValues(attrs) {
      let obj = {};
      obj.attack = Math.max(
        (attrs.might + Math.floor((attrs.reason + attrs.perception) / 2)),
        Math.floor(attrs.trickery / 2)
      );
      obj.order = Math.max(
        (attrs.reason + Math.floor((attrs.might + attrs.charisma) / 2)),
        Math.floor(attrs.intuition / 2)
      );
      obj.impact = Math.max(
        (attrs.charisma + Math.floor((attrs.reason + attrs.trickery) / 2)),
        Math.floor(attrs.perception / 2)
      );
      obj.defence = Math.max(
        (attrs.trickery + Math.floor((attrs.charisma + attrs.intuition) / 2)),
        Math.floor(attrs.might / 2)
      );
      obj.sabotage = Math.max(
        (attrs.intuition + Math.floor((attrs.trickery + attrs.perception) / 2)),
        Math.floor(attrs.reason / 2)
      );
      obj.research = Math.max(
        (attrs.perception + Math.floor((attrs.might + attrs.intuition) / 2)),
        Math.floor(attrs.charisma / 2)
      );
      return obj;
    }
  },
  mounted() {
    initFlowbite();

    let chars = localStorage.getItem("CHARS");
    if (chars == 'undefined')
      this.$CHARS.value = {}
    else {
      chars = JSON.parse(chars);
      if (chars == null)
        this.$CHARS.value = {};
      else
        this.$CHARS.value = chars;
    }

    let detail_level = JSON.parse(localStorage.getItem('detail_level'));
    if (detail_level !== null) this.detail_level = detail_level;
  },
  watch: {
    '$CHARS.value': {
      handler: (newValue, oldValue) => {
        localStorage.setItem("CHARS", JSON.stringify(newValue));
      }, deep: true,
    },
    my_characters: {
      handler: (newValue, oldValue) => {
        localStorage.setItem('my_characters', JSON.stringify(newValue));
      }, 
      deep: true,
    },
    detail_level: {
      handler: (newValue, oldValue) => {
        localStorage.setItem('detail_level', JSON.stringify(newValue));
      }, 
    }
  }
}



</script>

<template>
  <header block flex justify-between bg-gray-900 p-1 class="z-50 top-0 left-0 right-0 fixed h-16">
    <nav-links flex gap-3>
      <router-link to="/">
        <img src="/logo_small.png" class="max-h-9">
        <tip> Панель </tip>
      </router-link>
      <router-link to="/wiki">
        <Icon icon="game-icons:bookmarklet"/>
        <tip> Вики </tip>
      </router-link>
      <router-link to="/new-character">
        <Icon icon="game-icons:invisible"/>
        <tip> Создать </tip>
      </router-link>
    </nav-links>
    <head-controls>
      <a @click="detail_level = (detail_level+1) % detail_levels.length" min-w-16>
        <Icon :icon="detail_levels[detail_level].icon"/>
        <tip> {{detail_levels[detail_level].text}} </tip>
      </a>
    </head-controls>
  </header>
  
  <main-content w-full flex flex-col pt-16 :class="detail_levels[detail_level].id">
    <router-view/>
  </main-content>
  <my-tailwinds-classholder v-if='false' class="bg-war bg-knowledge bg-society bg-shadow bg-mystics bg-nature bg-war-dark bg-knowledge-dark bg-society-dark bg-shadow-dark bg-mystics-dark bg-nature-dark  bg-war-light bg-knowledge-light bg-society-light bg-shadow-light bg-mystics-light bg-nature-light bg-gradient-to-r from-war-dark from-war-light from-war  to-war-dark to-war-light to-war  from-knowledge-dark from-knowledge-light from-knowledge  to-knowledge-dark to-knowledge-light to-knowledge  from-shadow-dark from-shadow-light from-shadow  to-shadow-dark to-shadow-light to-shadow  from-society-dark from-society-light from-society  to-society-dark to-society-light to-society  from-mystics-dark from-mystics-light from-mystics  to-mystics-dark to-mystics-light to-mystics  from-nature-dark from-nature-light from-nature  to-nature-dark to-nature-light to-nature  via-nature-dark via-nature-light via-nature via-society-dark via-society-light via-society via-shadow-dark via-shadow-light via-shadow via-war-dark via-war-light via-war via-knowledge-dark via-knowledge-light via-knowledge via-mystics-dark via-mystics-light via-mystics  text-war-dark text-war-light text-war text-knowledge-dark text-knowledge-light text-knowledge text-shadow-dark text-shadow-light text-shadow  text-society-dark text-society-light text-society text-mystics-dark text-mystics-light text-mystics text-nature-dark text-nature-light text-nature"/>
  
  <header v-show='false'>
    <div class="rounded-md text-black">
      <div class="wrapper bg-sky-200 min-w-full min-h-screen">
        <character-edit v-if="state == 'character-edit'" px-10>
          <h1 mx-1> Редактировать персонажа </h1>
          <name-select  my-3 mx-1 block>
            <div class="relative w-full min-w-[200px] h-10" mb-3>
              <input
                class="peer w-full h-full bg-transparent text-blue-900 font-sans font-normal outline outline-0 focus:outline-0 disabled:bg-gray-50 disabled:border-0 transition-all placeholder-shown:border placeholder-shown:border-blue-400 placeholder-shown:border-t-blue-00 border-2 focus:border-2 border-t-transparent focus:border-t-transparent text-sm px-3 py-2.5 rounded-[7px] border-blue-400 focus:border-sky-600"
                placeholder=" " v-model="characterToEdit.name" /><label
                class="flex w-full h-full select-none pointer-events-none absolute left-0 font-normal !overflow-visible truncate peer-placeholder-shown:text-blue-500 leading-tight peer-focus:leading-tight peer-disabled:text-transparent peer-disabled:peer-placeholder-shown:text-blue-500 transition-all -top-1.5 peer-placeholder-shown:text-sm text-[11px] peer-focus:text-[11px] before:content[' '] before:block before:box-border before:w-2.5 before:h-1.5 before:mt-[6.5px] before:mr-1 peer-placeholder-shown:before:border-transparent before:rounded-tl-md before:border-t peer-focus:before:border-t-1 before:border-l peer-focus:before:border-l-1 before:pointer-events-none before:transition-all peer-disabled:before:border-transparent after:content[' '] after:block after:flex-grow after:box-border after:w-2.5 after:h-1.5 after:mt-[6.5px] after:ml-1 peer-placeholder-shown:after:border-transparent after:rounded-tr-md after:border-t peer-focus:after:border-t-1 after:border-r peer-focus:after:border-r-1 after:pointer-events-none after:transition-all peer-disabled:after:border-transparent peer-placeholder-shown:leading-[3.75] text-gray-500 peer-focus:text-gray-700 before:border-blue-200 peer-focus:before:!border-blue-600 after:border-gray-400 peer-focus:after:!border-gray-800">Имя персонажа
              </label>
            </div>
          </name-select>
          <experience-block flex gap-1 justify-between items-center px-1>
          <level-editor class="relative w-1/3 h-10">
              <input type="number"
                class="peer w-full h-full bg-transparent text-blue-900 font-sans font-normal outline outline-0 focus:outline-0 disabled:bg-gray-50 disabled:border-0 transition-all placeholder-shown:border placeholder-shown:border-blue-400 placeholder-shown:border-t-blue-500 border-2 focus:border-2 border-t-transparent focus:border-t-transparent text-sm px-3 py-2.5 rounded-[7px] border-blue-400 focus:border-sky-600"
                placeholder=" " v-model="characterToEdit.level" /><label
                class="flex w-full h-full select-none pointer-events-none absolute left-0 font-normal !overflow-visible truncate peer-placeholder-shown:text-blue-500 leading-tight peer-focus:leading-tight peer-disabled:text-transparent peer-disabled:peer-placeholder-shown:text-blue-500 transition-all -top-1.5 peer-placeholder-shown:text-sm text-[11px] peer-focus:text-[11px] before:content[' '] before:block before:box-border before:w-2.5 before:h-1.5 before:mt-[6.5px] before:mr-1 peer-placeholder-shown:before:border-transparent before:rounded-tl-md before:border-t peer-focus:before:border-t-1 before:border-l peer-focus:before:border-l-1 before:pointer-events-none before:transition-all peer-disabled:before:border-transparent after:content[' '] after:block after:flex-grow after:box-border after:w-2.5 after:h-1.5 after:mt-[6.5px] after:ml-1 peer-placeholder-shown:after:border-transparent after:rounded-tr-md after:border-t peer-focus:after:border-t-1 after:border-r peer-focus:after:border-r-1 after:pointer-events-none after:transition-all peer-disabled:after:border-transparent peer-placeholder-shown:leading-[3.75] text-gray-500 peer-focus:text-gray-700 before:border-blue-200 peer-focus:before:!border-blue-600 after:border-gray-400 peer-focus:after:!border-gray-800">Уровень
              </label>
          </level-editor>
          <skillpoints-info font-bold text-xl>
            Очков развития: <span font-bold text-blue-600> {{skillpointsFree}} </span>
          </skillpoints-info>
        </experience-block>
        <h2 px-1> Характеристики: </h2>
        <attr-block flex px-2>
          <attrs-col flex flex-col class="w-1/2">
            <single-attr v-for="asp in $GLOB.aspects" flex justify-between items-center mb-1>
              <Icon icon="ph:minus-square-fill" text-2xl color-slate-400 @click="decreaseAttr(asp.attr)"/>
              <spec-span  text-lg> {{$GLOB.lang[asp.attr]}}: {{characterToEdit.attrs[asp.attr]}} </spec-span>
              <Icon icon="ph:plus-square-fill" text-2xl color-slate-400 @click="increaseAttr(asp.attr)"/>
            </single-attr>
          </attrs-col>
          <checks-col flex flex-col class="w-1/2"> 
            <single-check  v-for="asp in $GLOB.aspects" mb-1 flex justify-between px-4>
              <spec-span text-lg>{{$GLOB.lang[asp.checks]}}: </spec-span> <span text-lg font-bold> {{characterToEdit.checks[asp.checks]}}</span>
            </single-check>
          </checks-col>
        </attr-block>
        <h2 px-2 mt-2 mb-1>Доспехи: </h2>
        <armor-block flex mx-2 gap-7>
          <defence-block  flex items-center gap-1>
          <Icon icon="grommet-icons:shield" text-3xl text-black />
          <defence-editor class="relative w-full h-10">
              <input type="number"
                class="peer w-full h-full bg-transparent text-blue-900 font-sans font-normal outline outline-0 focus:outline-0 disabled:bg-gray-50 disabled:border-0 transition-all placeholder-shown:border placeholder-shown:border-blue-400 placeholder-shown:border-t-blue-500 border-2 focus:border-2 border-t-transparent focus:border-t-transparent text-sm px-3 py-2.5 rounded-[7px] border-blue-400 focus:border-sky-600"
                placeholder=" " v-model="characterToEdit.armor_defence" /><label
                class="flex w-full h-full select-none pointer-events-none absolute left-0 font-normal !overflow-visible truncate peer-placeholder-shown:text-blue-500 leading-tight peer-focus:leading-tight peer-disabled:text-transparent peer-disabled:peer-placeholder-shown:text-blue-500 transition-all -top-1.5 peer-placeholder-shown:text-sm text-[11px] peer-focus:text-[11px] before:content[' '] before:block before:box-border before:w-2.5 before:h-1.5 before:mt-[6.5px] before:mr-1 peer-placeholder-shown:before:border-transparent before:rounded-tl-md before:border-t peer-focus:before:border-t-1 before:border-l peer-focus:before:border-l-1 before:pointer-events-none before:transition-all peer-disabled:before:border-transparent after:content[' '] after:block after:flex-grow after:box-border after:w-2.5 after:h-1.5 after:mt-[6.5px] after:ml-1 peer-placeholder-shown:after:border-transparent after:rounded-tr-md after:border-t peer-focus:after:border-t-1 after:border-r peer-focus:after:border-r-1 after:pointer-events-none after:transition-all peer-disabled:after:border-transparent peer-placeholder-shown:leading-[3.75] text-gray-500 peer-focus:text-gray-700 before:border-blue-200 peer-focus:before:!border-blue-600 after:border-gray-400 peer-focus:after:!border-gray-800"> Защита
              </label>
          </defence-editor>
        </defence-block>
        <resist-block flex items-center gap-1>
          <Icon icon="game-icons:shoulder-armor" text-3xl text-black/>
          <resist-editor class="relative w-full h-10">
              <input type="number"
                class="peer w-full h-full bg-transparent text-blue-900 font-sans font-normal outline outline-0 focus:outline-0 disabled:bg-gray-50 disabled:border-0 transition-all placeholder-shown:border placeholder-shown:border-blue-400 placeholder-shown:border-t-blue-500 border-2 focus:border-2 border-t-transparent focus:border-t-transparent text-sm px-3 py-2.5 rounded-[7px] border-blue-400 focus:border-sky-600"
                placeholder=" " v-model="characterToEdit.armor" /><label
                class="flex w-full h-full select-none pointer-events-none absolute left-0 font-normal !overflow-visible truncate peer-placeholder-shown:text-blue-500 leading-tight peer-focus:leading-tight peer-disabled:text-transparent peer-disabled:peer-placeholder-shown:text-blue-500 transition-all -top-1.5 peer-placeholder-shown:text-sm text-[11px] peer-focus:text-[11px] before:content[' '] before:block before:box-border before:w-2.5 before:h-1.5 before:mt-[6.5px] before:mr-1 peer-placeholder-shown:before:border-transparent before:rounded-tl-md before:border-t peer-focus:before:border-t-1 before:border-l peer-focus:before:border-l-1 before:pointer-events-none before:transition-all peer-disabled:before:border-transparent after:content[' '] after:block after:flex-grow after:box-border after:w-2.5 after:h-1.5 after:mt-[6.5px] after:ml-1 peer-placeholder-shown:after:border-transparent after:rounded-tr-md after:border-t peer-focus:after:border-t-1 after:border-r peer-focus:after:border-r-1 after:pointer-events-none after:transition-all peer-disabled:after:border-transparent peer-placeholder-shown:leading-[3.75] text-gray-500 peer-focus:text-gray-700 before:border-blue-200 peer-focus:before:!border-blue-600 after:border-gray-400 peer-focus:after:!border-gray-800"> Снижение урона
              </label>
          </resist-editor>
        </resist-block>
        <slow-block flex items-center gap-1>
          <Icon icon="fluent:hexagon-three-16-regular" text-3xl text-black/>
          <slow-editor class="relative w-full h-10">
              <input type="number"
                class="peer w-full h-full bg-transparent text-blue-900 font-sans font-normal outline outline-0 focus:outline-0 disabled:bg-gray-50 disabled:border-0 transition-all placeholder-shown:border placeholder-shown:border-blue-400 placeholder-shown:border-t-blue-500 border-2 focus:border-2 border-t-transparent focus:border-t-transparent text-sm px-3 py-2.5 rounded-[7px] border-blue-400 focus:border-sky-600"
                placeholder=" " v-model="characterToEdit.movement" /><label
                class="flex w-full h-full select-none pointer-events-none absolute left-0 font-normal !overflow-visible truncate peer-placeholder-shown:text-blue-500 leading-tight peer-focus:leading-tight peer-disabled:text-transparent peer-disabled:peer-placeholder-shown:text-blue-500 transition-all -top-1.5 peer-placeholder-shown:text-sm text-[11px] peer-focus:text-[11px] before:content[' '] before:block before:box-border before:w-2.5 before:h-1.5 before:mt-[6.5px] before:mr-1 peer-placeholder-shown:before:border-transparent before:rounded-tl-md before:border-t peer-focus:before:border-t-1 before:border-l peer-focus:before:border-l-1 before:pointer-events-none before:transition-all peer-disabled:before:border-transparent after:content[' '] after:block after:flex-grow after:box-border after:w-2.5 after:h-1.5 after:mt-[6.5px] after:ml-1 peer-placeholder-shown:after:border-transparent after:rounded-tr-md after:border-t peer-focus:after:border-t-1 after:border-r peer-focus:after:border-r-1 after:pointer-events-none after:transition-all peer-disabled:after:border-transparent peer-placeholder-shown:leading-[3.75] text-gray-500 peer-focus:text-gray-700 before:border-blue-200 peer-focus:before:!border-blue-600 after:border-gray-400 peer-focus:after:!border-gray-800"> Скорость
              </label>
          </slow-editor>
        </slow-block>
        </armor-block>
        <h2 mx-2> Изучить умения: </h2>
        <traits-block mx-2>
          <!-- {{traitsAvailable}} -->
        </traits-block>
        <button-block flex justify-between gap-3 mx-2> 
        <button @click="saveEditedCharacter(characterToEditIndex)" bg-green-500 border-green-700 shadow-none>Сохранить персонажа</button>
        <button @click="deleteCharacter(characterToEditIndex)" bg-red-700 border-red-800 text-black> Удалить персонажа </button>
          </button-block>
        <!-- {{characterToEdit}} -->
        <!-- <h2> От Аспекта {{$GLOB.aspects[classSelected.aspects[0]].name}}: </h2>
        <trait-to-select block v-for="trait in $GLOB.aspects[classSelected.aspects[0]].traits" cursor-pointer @click="setTraitChosen(trait, 'second')" :class="{active: editor_traits_chosen.second.name == trait.name}">
          <b>{{trait.name}} </b>: {{trait.levels[0]}}
        </trait-to-select> -->
        </character-edit>
        <character-list px-2 text-center v-if="state == 'overview'">
          <h1 text-3xl font-bold> Ваши персонажи: </h1>
          <character-block justify-between mt-3 mx-2 pr-2 bg-slate-800 rounded-lg overflow-hidden v-for="(char, index) in my_characters" flex :key="index">
            <portrait-scheme class="relative w-[100px]">
            <svg height="100" width="50" >
              <!------>
              <!-- <path d="M10.3,26 A75,75 1 0,1 50,4 M10.3,26" fill="transparent" stroke="#8f0000" stroke-width="2" /> -->
              <!-- <path d="M8.3,25 A75,75 1 0,1 50,2 M8.3,25" fill="transparent" stroke="#8f0000" stroke-width="3" stroke-dasharray="2"/> -->
              <!------>
              <!-- <path d="M14.8,29.5 L50,9" fill="transparent" stroke="yellow" stroke-width="2" /> -->
              <!-- <path d="M12.8,28 L50,6.5" fill="transparent" stroke="yellow" stroke-width="3" stroke-dasharray="2"/> -->
              <!------>
              <!-- <path d="M8.3,75 A75,75 1 0,1 8.3,25 M8.3,75" fill="transparent" stroke="#ffff00" stroke-width="1"/> -->
              <!-- <path d="M10.3,74 A75,75 1 0,1 10.3,26 M10.3,75" fill="transparent" stroke="#ffff00" stroke-width="1" stroke-dasharray="2"/> -->
              <!------>
              <!-- <path d="M14.8,70.5 L14.8,29.5" fill="transparent" stroke="skyblue" stroke-width="3"/> -->
              <!-- <path d="M12.8,72 L12.8,28" fill="transparent" stroke="skyblue" stroke-width="1"/> -->
              <!------>
              <!-- <path d="M50,98 A75,75 1 0,1 8.3,75 M50,98" fill="transparent" stroke="#00ff00" stroke-width="1"/> -->
              <!-- <path d="M50,96 A75,75 1 0,1 10.3,74 M50,96" fill="transparent" stroke="#00ff00" stroke-width="2"/> -->
              <!------>
              <!-- <path d="M50,91 L14.8,70.5" fill="transparent" stroke="#00ff00" stroke-width="2" /> -->
              <!-- <path d="M50,93.5 L12.8,72" fill="transparent" stroke="#00ff00" stroke-width="3" stroke-dasharray="2"/> -->
    	      </svg>
            <img @click="selectCharacter(index)" :src="'img/portraits/'+char.class+'_'+char.gender+'.jpg'" inline-block class="w-[80px] h-[80px] hexagon absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <!-- <Icon icon="game-icons:switch-weapon" class="absolute bottom-0 text-xl p-0 color-white left-3/4 -translate-x-1/2"/> -->
            <!-- <img :src="'./img/weapons/bow.png'" class="absolute w-1/2 right-0 top-0" /> -->
          </portrait-scheme>
            <character-meta flex-grow flex flex-col justify-between>
              <div w-full pl-1 flex flex-col justify-between class="h-[100%]" py-1>
                <div flex justify-between> 
                  <h1 text-3xl font-bold text-white>{{char.name}}</h1>
                  <bursts-block flex items-center>
                    <Icon class="text-yellow-400" text-3xl icon="game-icons:fire-dash" v-for="n in char.bursts"/>
                  </bursts-block>
                </div>
            
              <health-block>
                <simple-hp v-if="hp_type == 'simple'" flex justify-between>
                  <hp-point v-for="n in char.max_hp" :class="{filled: n <= char.curr_hp, small: char.max_hp > 10}"> </hp-point>
                </simple-hp>
                <!-- <complex-hp flex class="gap-1">
                  <hp-scratch flex flex-col justify-end flex-grow>
                    <hp-bar> </hp-bar>
                    <hp-bar> </hp-bar>
                    <hp-bar class="filled"> </hp-bar>
                    <hp-bar class="filled"> </hp-bar>
                  </hp-scratch>
                  <hp-light flex flex-col justify-end flex-grow>
                    <hp-bar> </hp-bar>
                    <hp-bar class="filled"> </hp-bar>
                  </hp-light>
                  <hp-heavy flex flex-col justify-end flex-grow>
                    <hp-bar> </hp-bar>
                    <hp-bar> </hp-bar>
                    <hp-bar class="filled"> </hp-bar>
                    <hp-bar class="filled"> </hp-bar>
                  </hp-heavy>
                  <hp-fatal flex flex-col justify-end flex-grow >
                    <hp-bar class="filled"> </hp-bar>
                  </hp-fatal>
                </complex-hp> -->
              </health-block>
              <additional-block flex justify-between items-center>
                <div flex text-xl text-white items-center>
                <armor-info-block flex items-center mr-2>
                  <Icon icon="game-icons:shoulder-armor" text-xl text-white/>
                  {{ char.armor }}
                </armor-info-block>
                <movement-info-block flex items-center>
                  <Icon icon="fluent:hexagon-three-16-regular" text-xl text-white/>
                  {{ char.movement }}
                </movement-info-block>
                </div>
                <div>
                  <Icon icon="icon-park-outline:edit" text-blue-500 text-xl @click="editCharacter(index)"/>
                </div>
              </additional-block>
            </div>
            </character-meta>
            <character-control flex class="items-end" py-2>
              
            </character-control>
          </character-block>
          <div text-center> 
          <button inline-block m-2 @click="startCharCreation()">Новый персонаж</button>
          </div>
        </character-list>
        <character-edit v-if="state == 'char_creation'" block px-2>
          <editor-step v-if="editor_step == 1">
            <h1> Выберите расу персонажа </h1>
            <races-list  flex class="flex-wrap justify-between p-2">
              <race-block v-for="(item, key) in $GLOB.races" class="inline-block w-[32%] rounded-md overflow-hidden bg-sky-100 border-2 border-blue-400 mb-2 cursor-pointer" @click="raceSelect(item, key)">
                <img :src="'img/races/'+key+'.webp'" class='w-full inline-block'>
                <class-short-desc flex justify-center>
                  <class-name>{{item.name}}</class-name>
                </class-short-desc>
              </race-block>
            </races-list>
          </editor-step>
          <editor-step v-if="editor_step == 2">

            <h1> {{raceSelected.name}} </h1>
            <race-description block mb-4>
              {{ raceSelected.desc}}
            </race-description>
            <b>Связанные аспекты:</b> <spec-span mr-1 v-for="asp in raceSelected.aspects" :class="asp">{{$GLOB.aspects[asp].name}}</spec-span><br/>
            <race-info-block flex my-5>
              <img aspect-square class="w-2/5" rounded-lg :src="'img/races/'+raceSelectedKey+'.webp'"/>
            <race-stats flex justify-between ml-2 flex-wrap class="items-center">
              <race-stat flex flex-col text-center text-blue-700 my-1 class="w-2/5">
                <stat-hint text-xs>
                  очков передвижения
                </stat-hint>
                <stat-value text-3xl flex class="justify-center items-center">
                  <Icon icon="mdi:arrow-right-bold-hexagon-outline" text-4xl mr-1 inline-block/><div inline-block>{{ raceSelected.movement }}</div>
                </stat-value>
              </race-stat>
              <race-stat flex flex-col text-center text-yellow-600 my-1 class="w-2/5">
                <stat-hint text-xs>
                  порывов на старте
                </stat-hint>
                <stat-value text-3xl flex class="justify-center items-center">
                  <Icon icon="game-icons:fire-dash" text-4xl mr-1 inline-block/><div inline-block>{{ raceSelected.bursts }}</div>
                </stat-value>
              </race-stat>
              <race-stat flex flex-col text-center text-red-700 my-1 class="w-2/5">
                <stat-hint text-xs>
                  очков здоровья
                </stat-hint>
                <stat-value text-3xl flex class="justify-center items-center">
                  <Icon icon="healthicons:health" text-4xl mr-1 inline-block/><div inline-block>{{ raceSelected.max_hp }}</div>
                </stat-value>
              </race-stat>
              <race-stat flex flex-col text-center text-green-800 my-1 class="w-2/5">
                <stat-hint text-xs>
                  сопротивление урону
                </stat-hint>
                <stat-value text-3xl flex class="justify-center items-center">
                  <Icon icon="game-icons:shoulder-armor" text-4xl mr-1 inline-block/><div inline-block>{{ raceSelected.armor }}</div>
                </stat-value>
              </race-stat>
            </race-stats>
            </race-info-block>
            
            <button-block flex justify-between>
              <button @click="prevEditorStep()" back>Назад</button><button @click="nextEditorStep()"> Подтвердить </button>
            </button-block>
          </editor-step>
          <editor-step v-if="editor_step == 3">
            <h1> Выберите стартовый класс: </h1>
          <char-meta flex class="justify-between" p-2>
            <button @click="prevEditorStep()" back>Назад</button>
            
            <gender-select class="inline-flex items-center">
    <span mr-2> Ж </span>
    <div class="relative inline-block w-8 h-4 rounded-full cursor-pointer">
      <input defaultChecked id="switch-1" type="checkbox" v-model="male_gender"
        class="absolute w-8 h-4 transition-colors duration-300 rounded-full appearance-none border-red-400 border-2 cursor-pointer peer bg-red-300 checked:bg-blue-300 checked:border-blue-400 peer-checked:before:bg-blue-500" />
      <label htmlFor="switch-1"
        class="before:content[''] absolute top-2/4 -left-1 h-5 w-5 -translate-y-2/4 cursor-pointer rounded-full border-2 border-blue-100 bg-red-400 shadow-md transition-all duration-300 before:absolute before:top-2/4 before:left-2/4 before:block before:h-10 before:w-10 before:-translate-y-2/4 before:-translate-x-2/4 before:rounded-full before:bg-blue-500 
        border-red-500 before:opacity-0 before:transition-opacity hover:before:opacity-10 peer-checked:translate-x-full peer-checked:border-blue-600 peer-checked:before:bg-blue-500  peer-checked:bg-blue-400" >
        <div class="inline-block p-5 rounded-full top-2/4 left-2/4 -translate-x-2/4 -translate-y-2/4"
          data-ripple-dark="true"></div>
      </label>
    </div>
  <span ml-1> М </span>
  </gender-select>
</char-meta>
<classes-list  flex class="flex-wrap justify-between p-2">
  <class-block v-for="(item, key) in $GLOB.classes" class="inline-block w-[32%] rounded-md overflow-hidden bg-sky-100 border-2 border-blue-400 mb-2 cursor-pointer" @click="classSelect(item, key)">
    <img :src="'img/portraits/'+item.id+'_'+gender+'.jpg'" class='w-full inline-block'>
    <class-short-desc flex justify-center>
      <class-name>{{item.name}}</class-name>
    </class-short-desc>
  </class-block>
</classes-list>
          </editor-step>
        <editor-step v-else-if="editor_step == 4" class="p-2 block">
          <button-block flex justify-between>
          <button  @click="prevEditorStep()" back>Назад</button><button @click="chooseClass()"> Выбрать этот класс! </button>
          </button-block>
          <h1> {{classSelected.name}} </h1>
          <b>Краткое описание:</b>{{classSelected.desc}} <br/>
          <b>Связанные аспекты:</b> <spec-span mr-1 v-for="asp in classSelected.aspects" :class="asp">{{$GLOB.aspects[asp].name}}</spec-span><br/>
          <b>Сильные характеристики:</b> <spec-span mr-1 v-for="asp in classSelected.aspects">{{$GLOB.lang[$GLOB.aspects[asp].attr]}}</spec-span><br/>
          <b>Сильные проверки:</b> <spec-span mr-1 v-for="asp in classSelected.aspects"> {{$GLOB.lang[$GLOB.aspects[asp].checks]}}</spec-span><br/>
          <b>Умения:</b>
          <trait-block v-for="trait in classSelected.traits" block>
            <trait-name> {{trait.name}}</trait-name>
            <ol class="list-decimal ml-4">
              <li v-for="level in trait.levels"> {{level}}</li>
            </ol>
          </trait-block>
          <button-block flex justify-between>
          <button @click="prevEditorStep()" back>Назад</button><button @click="chooseClass()"> Выбрать этот класс! </button>
          </button-block>
        </editor-step>
        
        <editor-step v-else-if="editor_step == 5">
          <h1>Введите имя Вашего персонажа:</h1>
          <name-select class="w-1/2" my-3>
  <div class="relative w-full min-w-[200px] h-10" mb-3>
    <input
      class="peer w-full h-full bg-transparent text-blue-900 font-sans font-normal outline outline-0 focus:outline-0 disabled:bg-gray-50 disabled:border-0 transition-all placeholder-shown:border placeholder-shown:border-blue-400 placeholder-shown:border-t-blue-00 border-2 focus:border-2 border-t-transparent focus:border-t-transparent text-sm px-3 py-2.5 rounded-[7px] border-blue-400 focus:border-sky-600"
      placeholder=" " v-model="editor_char_name" /><label
      class="flex w-full h-full select-none pointer-events-none absolute left-0 font-normal !overflow-visible truncate peer-placeholder-shown:text-blue-500 leading-tight peer-focus:leading-tight peer-disabled:text-transparent peer-disabled:peer-placeholder-shown:text-blue-500 transition-all -top-1.5 peer-placeholder-shown:text-sm text-[11px] peer-focus:text-[11px] before:content[' '] before:block before:box-border before:w-2.5 before:h-1.5 before:mt-[6.5px] before:mr-1 peer-placeholder-shown:before:border-transparent before:rounded-tl-md before:border-t peer-focus:before:border-t-1 before:border-l peer-focus:before:border-l-1 before:pointer-events-none before:transition-all peer-disabled:before:border-transparent after:content[' '] after:block after:flex-grow after:box-border after:w-2.5 after:h-1.5 after:mt-[6.5px] after:ml-1 peer-placeholder-shown:after:border-transparent after:rounded-tr-md after:border-t peer-focus:after:border-t-1 after:border-r peer-focus:after:border-r-1 after:pointer-events-none after:transition-all peer-disabled:after:border-transparent peer-placeholder-shown:leading-[3.75] text-gray-500 peer-focus:text-gray-700 before:border-blue-200 peer-focus:before:!border-blue-600 after:border-gray-400 peer-focus:after:!border-gray-800">Имя персонажа
    </label>
  </div>
</name-select>
<button-block flex justify-between>
          <button @click="prevEditorStep()" back>Назад</button><button :disabled="editor_char_name.length < 2" @click="chooseClass()"> Подтвердить </button>
          </button-block>  
        </editor-step>
        <editor-step v-else-if="editor_step == 6">
          
          <h1>Распределите Характеристики: </h1>
          <p> Когда Вы совершаете какое-то сложное действие в игре (будь то атака, попытка создать механизм, убедить кого-то помочь или любое другое), Ваш успех или провал определяется результатом Проверки.</p>
          <p> При Проверке Вы бросаете куб d12 и сравниваете выпавшее число с необходимым для того, чтобы пройти. Конечно же, вероятность Вашего успеха зависит от Ваших характеристик, которые сейчас и нужно распределить. </p>
          <p>Выбранный Вами класс  силён в двух аспектах: <spec-span inline mr-1 v-for="asp in classSelected.aspects" :class="asp">{{$GLOB.aspects[asp].name}}</spec-span>, а значит и в связанных с ними характеристиках: <spec-span mr-1 v-for="asp in classSelected.aspects" :class="asp">{{$GLOB.lang[$GLOB.aspects[asp].attr]}}</spec-span></p>
          <p> В этих двух характеристиках Вы получаете значения 6 и 4, но можете самостоятельно выбрать, в какой 6, в какой 4 </p>
          <div flex flex-col my-3>
          <attr-block flex justify-center>
          <spec-span mr-1 text-2xl v-for="asp in classSelected.aspects" :class="asp">{{$GLOB.lang[$GLOB.aspects[asp].attr]}} = {{editorAttrs[$GLOB.aspects[asp].attr]}}</spec-span>
          </attr-block>
          <button-block flex justify-center mt-3> 
            <button @click="swapStrongestAttributes()" bg-blue-500 shadow-none>  Сменить </button>
          </button-block>
          <p> В характеристиках, противоположных Вашим Аспектам, Вы получаете ноль. Ещё четыре очка распределяются по оставшимся характеристикам. Итого Ваши значения Характеристик и бонусов Проверок: </p>
          <attr-result flex justify-around>
          <attr-result-block flex flex-col>
            <spec-span mr-1 mt-1 text-xl v-for="asp, key in $GLOB.aspects" :class="key">{{$GLOB.lang[asp.attr]}} = {{editorAttrs[asp.attr]}}</spec-span>
          </attr-result-block>
          <check-result-block flex flex-col>
            <spec-span mr-1 mt-1 text-xl v-for="asp, key in $GLOB.aspects" :class="key">{{$GLOB.lang[asp.checks]}} = {{editorChecks[asp.checks]}}</spec-span>
          </check-result-block>
          </attr-result>
        </div>
          <!-- <h2>Вы лучше всего разбираетесь в:</h2> -->
          <!-- <b>Сильные характеристики:</b> <spec-span mr-1 v-for="asp in classSelected.aspects" :class="asp" @click="selectMaxAttr(asp)">{{$GLOB.lang[$GLOB.aspects[asp].attr]}}</spec-span> -->
          <!-- <div class="aspect-video bg-white relative min-w-[400px]" mx-2 my-1>
          <skill-data absolute left-1 top-1 class="">
            <skill-label>Атака: </skill-label>
            <skill-number>{{ checks.attack }}</skill-number>
          </skill-data>
          <skill-data absolute right-1 top-1>
            <skill-label>Порядок: </skill-label>
            <skill-number>{{ checks.order }}</skill-number>
          </skill-data>
          <skill-data absolute right-1 class="top-[50%] translate-y-[-50%]">
            <skill-label>Влияние: </skill-label>
            <skill-number>{{ checks.impact }}</skill-number>
          </skill-data>
          <skill-data absolute right-1 bottom-1>
            <skill-label>Защита: </skill-label>
            <skill-number>{{ checks.defence }}</skill-number>
          </skill-data>
          <skill-data absolute left-1 bottom-1>
            <skill-label>Диверсия: </skill-label>
            <skill-number>{{ checks.sabotage }}</skill-number>
          </skill-data>
          <skill-data absolute left-1 class="top-[50%] translate-y-[-50%]">
            <skill-label>Поиск: </skill-label>
            <skill-number>{{ checks.research }}</skill-number>
          </skill-data>
          <attr-input flex class="flex justify-center absolute items-center rounded-full bg-red-400 min-w-8" aspect-square top-7 left-33>
            <Icon icon="ep:arrow-left-bold" @click="modifyAttr('might', -1)"/>
            <attr-number class="text-[19px]">
              {{ attrs.might }}
            </attr-number>
            <Icon icon="ep:arrow-right-bold" @click="modifyAttr('might', 1)"/>
          </attr-input>
          <attr-input flex class="flex justify-center absolute items-center rounded-full bg-blue-400 min-w-8" aspect-square top-7 right-33>
            <Icon icon="ep:arrow-left-bold" @click="modifyAttr('reason', -1)"/>
            <attr-number class="text-[19px]">
              {{ attrs.reason }}
            </attr-number>
            <Icon icon="ep:arrow-right-bold" @click="modifyAttr('reason', 1)"/>
          </attr-input>
          <attr-input flex class="flex justify-center absolute items-center rounded-full bg-orange-400 min-w-8 top-[50%] translate-y-[-50%]" aspect-square right-25>
            <Icon icon="ep:arrow-left-bold" @click="modifyAttr('charisma', -1)"/>
            <attr-number class="text-[19px]">
              {{ attrs.charisma }}
            </attr-number>
            <Icon icon="ep:arrow-right-bold" @click="modifyAttr('charisma', 1)"/>
          </attr-input>
          <attr-input flex class="flex justify-center absolute items-center rounded-full bg-gray-500 min-w-8" aspect-square right-33 bottom-7>
            <Icon icon="ep:arrow-left-bold" @click="modifyAttr('trickery', -1)"/>
            <attr-number class="text-[19px]">
              {{ attrs.trickery }}
            </attr-number>
            <Icon icon="ep:arrow-right-bold" @click="modifyAttr('trickery', 1)"/>
          </attr-input>
          <attr-input flex class="flex justify-center absolute items-center rounded-full bg-purple-600 min-w-8" aspect-square left-33 bottom-7>
            <Icon icon="ep:arrow-left-bold" @click="modifyAttr('intuition', -1)"/>
            <attr-number class="text-[19px]">
              {{ attrs.intuition }}
            </attr-number>
            <Icon icon="ep:arrow-right-bold" @click="modifyAttr('intuition', 1)"/>
          </attr-input>
          <attr-input flex class="flex justify-center absolute items-center rounded-full bg-green-500 min-w-8 top-[50%] translate-y-[-50%]" aspect-square left-25>
            <Icon icon="ep:arrow-left-bold" @click="modifyAttr('perception', -1)"/>
            <attr-number class="text-[19px]">
              {{ attrs.perception }}
            </attr-number>
            <Icon icon="ep:arrow-right-bold" @click="modifyAttr('perception', 1)"/>
          </attr-input>
        </div> -->
        <p>Почти готово! Осталось только выбрать, какие умения будут у Вашего персонажа. Нужно выбрать по одному от класса и каждого Аспекта, суммарно три.</p>
        <h2> От класса {{classSelected.name}}: </h2>
        <trait-to-select block v-for="trait in $GLOB.classes[classSelectedKey].traits" cursor-pointer @click="setTraitChosen(trait, 'first')" :class="{active: editor_traits_chosen.first.name == trait.name}">
          <b>{{trait.name}} </b>: {{trait.levels[0]}}
        </trait-to-select>
        <h2> От Аспекта {{$GLOB.aspects[classSelected.aspects[0]].name}}: </h2>
        <trait-to-select block v-for="trait in $GLOB.aspects[classSelected.aspects[0]].traits" cursor-pointer @click="setTraitChosen(trait, 'second')" :class="{active: editor_traits_chosen.second.name == trait.name}">
          <b>{{trait.name}} </b>: {{trait.levels[0]}}
        </trait-to-select>
        <h2> От Аспекта {{$GLOB.aspects[classSelected.aspects[1]].name}}: </h2>
        <trait-to-select block v-for="trait in $GLOB.aspects[classSelected.aspects[1]].traits" cursor-pointer @click="setTraitChosen(trait, 'third')" :class="{active: editor_traits_chosen.third.name == trait.name}">
          <b>{{trait.name}} </b>: {{trait.levels[0]}}
        </trait-to-select>
        
        <button-block flex justify-between>
          <button @click="prevEditorStep()" back>Назад</button><button @click="finishCharCreation()"> Готово!</button>
          </button-block>  
        </editor-step>
        
        </character-edit>
        <character-screen v-else-if="state == 'character_screen'">
          
          <characters-overview flex justify-start class="items-center">
            <Icon icon="fa6-solid:list" class="w-1/5" text-4xl @click="state = 'overview'"/>
            <character-icon v-for="char, key in my_characters" class="w-1/5" @click="character_selected = key">
              <img :src="'img/portraits/'+char.class+'_'+char.gender+'.jpg'" inline-block class="w-full">
            </character-icon>
          </characters-overview>
          <div flex mt-3 mx-2 pr-2 bg-slate-800 rounded-lg overflow-hidden>
            <img aspect-square :src="'img/portraits/'+currentChar.class+'_'+currentChar.gender+'.jpg'" inline-block class="w-1/5">
            <div w-full pl-2 flex flex-col justify-between>
              <div flex justify-between> 
              <h1 text-3xl font-bold text-white>{{currentChar.name}}</h1>
              <bursts-block @click="useBurst()" flex items-center>
                <Icon class="text-yellow-400" text-3xl icon="game-icons:fire-dash" v-for="n in currentChar.bursts"/>
              </bursts-block>
            </div>
          <health-block>
          <simple-hp v-if="hp_type == 'simple'" flex justify-between>
            <hp-point v-for="n in currentChar.max_hp" :class="{filled: n <= currentChar.curr_hp, small: max_hp > 10}"> </hp-point>
          </simple-hp>
        </health-block>
        <button-block flex justify-between class="items-center">
          <Icon icon="game-icons:cross-mark"  @click="wound(9)" text-red-800 text-3xl/>
          <Icon icon="game-icons:open-wound" @click="wound(3)" text-red-600 text-3xl/>
          <Icon icon="game-icons:rough-wound" @click="wound(1)" text-red-500 text-3xl/>
          <Icon icon="material-symbols:more-time" @click="heal(3)" text-blue-600 text-3xl/>
        </button-block>
        
            </div>
          </div>
        <button-block flex justify-between p-2>
          <button bg-green-600 border-green-800 text-xl shadow-none @click="turnStarts()">Начало хода</button>
          <button bg-blue-400 border-blue-600 text-xl shadow-none @click="turnEnds()">Конец хода</button>
        </button-block>  
        <defence-block mx-2 my-1 p-2 bg-white flex justify-between>
          <defence-col flex flex-col class="basis-1/4" text-left>
            <defence-desc>
              Защита
            </defence-desc>
            <defence-val>
              Удары
            </defence-val>
            <defence-val>
              Снаряды
            </defence-val>
          </defence-col>
          <defence-col flex flex-col text-center class="basis-1/4">
            <defence-desc>
              Фронт
            </defence-desc>
            <defence-val :class="defence.melee_front.class">
              {{ defence.melee_front.name }}
            </defence-val>
            <defence-val :class="defence.ranged_front.class">
              {{ defence.ranged_front.name }}
            </defence-val>
          </defence-col>
          <defence-col flex flex-col class="basis-1/4">
            <defence-desc>
              Фланг
            </defence-desc>
            <defence-val :class="defence.melee_side.class">
              {{ defence.melee_side.name }}
            </defence-val>
            <defence-val :class="defence.ranged_side.class">
              {{ defence.ranged_side.name }}
            </defence-val>
          </defence-col>
          <defence-col flex flex-col class="basis-1/4">
            <defence-desc>
              Тыл
            </defence-desc>
            <defence-val :class="defence.melee_back.class">
              {{ defence.melee_back.name }}
            </defence-val>
            <defence-val :class="defence.ranged_back.class">
              {{ defence.ranged_back.name }}
            </defence-val>
          </defence-col>
        </defence-block>
          <checks-table flex mx-2 my-1 p-2 bg-sky-100>
          <check-labels flex flex-col class="basis-96">
            <dif-name>
              
            </dif-name>
            <dif-name>
              
            </dif-name>
            
            <check-name>
              {{currentChar.equips.first.name}}
            </check-name>
            <check-name>
              {{currentChar.equips.second.name}}
            </check-name>
            <check-divider/>
            <check-name>
              Конфликт
            </check-name>
            <check-name>
              Порядок
            </check-name>
            <check-name>
              Влияние
            </check-name>
            <check-name>
              Коварство
            </check-name>
            <check-name>
              Диверсия
            </check-name>
            <check-name>
              Поиск
            </check-name>
          </check-labels>
          <check-values-wrap block overflow-x-auto class="no-scrollbar-1">
            <check-values flex flex-row>
              <template v-for="(cat, key) in check_diffs_structured">
                <check-cat flex flex-col :class="cat.class" v-if="cat.label !== 'Нулевая' && cat.label !=='Плохая'">
                  <cat-name>
                    {{cat.label}} 
                  </cat-name>
                  <cat-cols flex>
  <check-column v-for="diff in cat.subcat" flex flex-col :class="diff.class">
  <dif-name>
    {{ diff.label }}
  </dif-name>
  
  <check-value>
    {{ currentChar.equips.first.attack + checks.attack - diff.number}}
  </check-value>
  <check-value>
    {{ currentChar.equips.second.attack + checks.attack - diff.number}}
  </check-value>
  
  <check-divider/>
  <check-value v-for="item, key in currentChar.checks">
    <Icon icon="icomoon-free:cross" v-if="diff.number - item > 12"/>
    <Icon icon="fa:check" v-else-if="diff.number - item < 2"/>
    <template v-else>{{ diff.number - item }}</template>
  </check-value>
</check-column>
</cat-cols>
                </check-cat>
              </template>
            </check-values>
          </check-values-wrap>
        </checks-table>
        <equips-table flex class="justify-between">
          <equip-table flex flex-col class="flex-1 w-1/2" bg-white mx-2 my-1 p-2 
           v-for="(equip, index) in my_characters[character_selected].equips" :class="{active: index == currentChar.equip_chosen}" @click="chooseEquip(index)">
            <equip-name text-center>
              <input type="text" v-model="equip.name" px-2 text-center outline-none class="w-3/4"/>
            </equip-name>
            <equip-stats flex justify-between>
              <equip-attack flex justify-center items-center>
                <Icon icon="ph:sword-fill" />
                <input type="number" v-model="equip.attack" ml-1 mr-2 class="w-1/2"/>
              </equip-attack>
              <equip-melee-defence flex justify-center items-center>
                <Icon icon="mdi:shield-sword" />
                <input type="number" v-model="equip.defence_melee" ml-1 mr-2 class="w-1/2"/>
              </equip-melee-defence>
              <equip-ranged-defence flex justify-center items-center>
                <Icon icon="game-icons:arrows-shield"/>
                <input type="number" v-model="equip.defence_ranged" ml-1  class="w-1/2"/>
              </equip-ranged-defence>
            </equip-stats>
            <equip-attacks>
              <equip-attack v-for="(att, key) in equip.attacks" block>
                <input type="number" class="w-1/6" v-model="my_characters[character_selected].equips[index].attacks[key].score">- <input class="w-3/4" type="text" v-model="my_characters[character_selected].equips[index].attacks[key].text">
              </equip-attack>
            </equip-attacks>
          </equip-table>
        </equips-table>
        <traits-table flex flex-col m-2>
          <trait-block v-for="trait in my_characters[character_selected].traits">
            <b block> {{trait.name}}:</b> 
            <p>{{trait.levels[0]}} </p>
          </trait-block>
        </traits-table>
        
        </character-screen>
        
      </div>
    </div>
    <!-- <router-link to="/">Перейти к Foo</router-link>
    <router-link to="/about">Перейти к Bar</router-link-->
  </header>
    
</template>

<style>
  check-value, check-name {
    min-height: 30px;
    border-bottom: 2px solid transparent;
  }
  check-value {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  check-value:nth-child(2n), check-name:nth-child(2n+1) {
    background-color: rgba(0,0,0,0.03);
    border-bottom: 2px solid rgba(0,0,0, 0.05);
  }
  check-column {
    align-items: stretch;
    min-width: 60px;
  }
  dif-name {
    min-height: 24px;
    text-align: center;
  }
  cat-name {
    text-align: center;
  }
  check-cat {
    margin-left: 5px;
  }
  attr-block {
    @apply select-none;
  }
  equip-table {
    @apply opacity-40;
    cursor: pointer;
  }
  equip-table.active {
    @apply opacity-100;
  }
  check-divider {
    min-height: 2px;
    @apply bg-slate-400 my-1;
  }
  defence-col {
    @apply text-center;
  }
  defence-desc, defence-val {
    @apply py-1;
  }
  defence-val {
    @apply text-xs;
  }
  hp-point {
    @apply min-h-5 border-4 border-red-600/10 bg-red-500/10;
  }
  hp-point.small {
    @apply min-h-4 border-2;
  }
  hp-point.filled {
    @apply border-red-600/50 bg-red-500/50
  }
  hp-bar {
    @apply min-h-[15%] h-[100%] border-2 border-emerald-800/50 bg-emerald-900/50 min-w-full block mt-0.5;
  }
  hp-scratch hp-bar.wounded {
    @apply border-red-500 bg-red-400;
  }
  hp-light hp-bar.wounded {
    @apply border-red-700 bg-red-600;
  }
  hp-heavy hp-bar.wounded {
    @apply border-red-800 bg-red-700;
  }
  hp-fatal hp-bar.wounded {
    @apply border-red-800 bg-red-900;
    background-image: url('/img/icons/heart.svg');
    background-repeat: no-repeat;
    background-position: center center;
    animation: BgPulse 2s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite
  }
  swap-weapon {
    @apply bg-blue-900 p-0.5 mx-0.5 rounded-full;
  }
  swap-weapon:hover svg {
    @apply text-white;
  }
  swap-weapon svg{
    @apply text-white/80;
  }
  swap-weapon svg:not(:first-child){
    @apply -ml-0.5;
  }

  hp-bar.filled {
    @apply border-emerald-800 bg-emerald-600;
  }
  h1 {
    @apply text-2xl text-center font-bold py-1;
  }
  h2 {
    @apply text-lg font-bold pt-3 pb-1;
  }
  race-block {
    @apply rounded-lg my-3 border-4 border-transparent;

  }
  race-block.active {
    @apply border-4 border-purple-700;
  }
  .hexagon {
    clip-path: polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%);
  }
  p {
    @apply mt-1;
  }
  trait-to-select {
    border: 2px solid rgba(0, 0, 0, 0.2);
    @apply p-2 mb-1
  }
  trait-to-select.active {
    border: 2px solid rgba(255, 255, 0, 0.6);
  }


  header a {
    @apply flex flex-col items-center;
  }
  header a svg {
    @apply text-4xl;
  }


@keyframes BgPulse {
    0%{background-size: 75%;}
    50%{background-size: 80%;}
    55%{background-size: 65%;}
    60%{background-size: 70%;}
    80%{background-size: 80%;}
    85%{background-size: 65%;}
    100%{background-size: 70%;}
}

.filter-outline {
  --filter-color: rgba(0, 0, 0, 0.6);
  filter:
    drop-shadow(1.5px 1px 1px var(--filter-color)) drop-shadow(-0.5px -0.5px 1px var(--filter-color))
    drop-shadow(-0.5px 1px 1px var(--filter-color)) drop-shadow(0.5px -0.5px 1px var(--filter-color));
}

.rotating-animation {
  background-size: 100% 100%;
  animation: RotateBG 5s linear infinite;
}

@keyframes RotateBG {
  0% {
    transform: translate(-50%, -50%) rotate(0deg);
  }

  50% {
    transform: translate(-50%, -50%) rotate(180deg);
  }

  100% {
    transform: translate(-50%, -50%) rotate(360deg);
  }

}
</style>
