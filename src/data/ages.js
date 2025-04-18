export default {
    youth: {
        name: {
            m: 'Юный',
            f: 'Юная'
        },
        bursts: 1, 
        movement: 1,
        max_hp: 2,
        bonus_xp: 0,
        xp: 3,
        steps: 0,
    },
    young: {
        name: {
            m: 'Молодой',
            f: 'Молодая'
        },
        bursts: 0,  
        movement: 1,
        max_hp: 0,
        bonus_xp: 0,
        xp: 4,
        steps: 1,
    },
    mature: {
        name: {
            m: 'Средний',
            f: 'Средняя'
        },
        bursts: 0, 
        movement: 0,
        max_hp: 0,
        bonus_xp: 4,
        xp: 4,
        steps: 3,
    },
    senior: {
        name: {
            m: 'Пожилой',
            f: 'Пожилая'
        },
        bursts: 0, 
        movement: -1,
        max_hp: -2,
        bonus_xp: 6,
        xp: 4,
        steps: 4,
    },
    elder: {
        name: {
            m: 'Древний',
            f: 'Древняя'
        },
        bursts: 0, 
        movement: -2,
        max_hp: -4,
        bonus_xp: 12,
        xp: 4,
        steps: 6,
    },
}