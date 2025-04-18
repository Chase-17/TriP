export default {
    phon: {
        con: {
            voiced: {
                'в': 4.19,
                'д': 2.26,
                'з': 1.81,
                'б': 1.51,
                'г': 1.41,
                'ж': 0.78,
            },
            voiceless: {
                'т': 6.30,
                'с': 5.45,
                'к': 3.47,
                'п': 3.35,
                'ч': 1.27,
                'ш': 1.26,
                'х': 0.92,
                'ц': 0.52,
                'ф': 0.40,
            },
            sonorant: {
                'н': 6.35,
                'р': 5.53,
                'л': 4.32,
                'м': 3.29,
                'й': 1.31,
            }
        },
        vow: {
            hard: {
                'о': 9.28,
                'а': 8.66,
                'э': 0.17,
                'у': 2.90,
                'ы': 2.11, 
            },
            soft: {
                'ё': 0.50,
                'я': 2.22,
                'е': 7.60,
                'ю': 1.03,
                'и': 7.45, 
            }
        }
    },
    syl_types: {
        'cvc': 1,
        'cv': 1,
        'vc': 1,
        'v': 1,
    },
    replacements: {
        'йа' : 'я',
        'йо' : 'ё',
        'йу' : 'ю',
        'йэ' : 'е',
        'йы' : 'ы',
        'йя' : 'я',
        'йё' : 'я',
        'йю' : 'я',
        'шя' : 'ща',
        'шё' : 'ще',
        'шы' : 'ши',
        'жы' : 'жи',
        'шю' : 'щу',
        'жя' : 'жа',
        'жю' : 'жу',
        'жё' : 'жо',
        'чя' : 'ча',
        'чю' : 'чу',
    },
    replaceMultiple(str, map) {
        const regex = new RegExp(Object.keys(map).join('|'), 'g');
        return str.replace(regex, match => map[match]);
    },
    weightedRandom(list) {
        let summed = {};
        let sum = 0;
        
        Object.entries(list).forEach(([key, value]) => {
            sum += value;
            summed[key] = sum;
        });
        let random = Math.random();
        for (let i = 0; i < Object.entries(summed).length; i++) {
            if ((Object.entries(summed)[i][1] / sum) >= random) {
                return Object.entries(summed)[i][0];
            }
        }
        
    },
    genName(options = {}) {
        let syl_number = Math.floor(Math.random()*2) + 2;
        if (typeof options.syl_number !== 'undefined')
            syl_number = options.syl_number;
        
        let result = "";
        for (let i = 0; i< syl_number; i++) {
            result += this.genSyl(options);
        }
        
        result = this.replaceMultiple(result, this.replacements)
        result = result.charAt(0).toUpperCase() + result.slice(1)
        
        return result;
    },
    genSyl(options = {}) {
        let syl_types_modded = JSON.parse(JSON.stringify(this.syl_types));
        if (typeof options['syl_mod'] !== 'undefined')
            Object.entries(this.syl_types).forEach(([key, value]) => {
                if (typeof options.syl_mod[key] !== 'undefined')
                    syl_types_modded[key] = value * options.syl_mod[key];
                else syl_types_modded[key] = value;
            })
        let syl_type = this.weightedRandom(syl_types_modded);

        let con_list_modded = {};
        Object.entries(this.phon.con).forEach(([group_name, group]) => {
            Object.entries(group).forEach(([key, value]) => {
                let mod = 1;
                if (typeof options.group_mod !== 'undefined')
                    if (typeof options.group_mod[group_name] !== 'undefined')
                        mod = options.group_mod[group_name];
                con_list_modded[key] = value * mod;
            });
        });
        let vow_list_modded = {};
        Object.entries(this.phon.vow).forEach(([group_name, group]) => {
            Object.entries(group).forEach(([key, value]) => {
                let mod = 1;
                if (typeof options.group_mod !== 'undefined')
                    if (typeof options.group_mod[group_name] !== 'undefined')
                        mod = options.group_mod[group_name];
                vow_list_modded[key] = value * mod;
            });
        });

        let result = "";
        for (let i = 0; i < syl_type.length; i++) {
            if (syl_type[i] == 'c') result += this.weightedRandom(con_list_modded);
            else result += this.weightedRandom(vow_list_modded);
        }
        return result;
    }
}