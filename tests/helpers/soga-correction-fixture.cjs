function fixture() {
  const starts = ['16:15','17:00','17:45','18:30','19:15','20:00'];
  const ends = ['17:00','17:45','18:30','19:15','20:00','20:45'];
  const slots = starts.map((start_time, i) => ({start_time, end_time: ends[i]}));
  const row = (date, staff_code, index, type = 'SHIFT') => ({date, staff_code, ...slots[index], store_code: 'SOGA', active: true, assignment_type: type, shift_id: date + '-' + staff_code + '-' + index});
  const assignments = [
    ...slots.map((_, i) => row('2026-11-25','KEVIN',i)),
    ...slots.map((_, i) => row('2026-11-26','SAKAKI',i)),
    {date:'2026-11-25',staff_code:'KEVIN',start_time:'10:15',end_time:'11:00',assignment_type:'TRIAL',shift_id:'morning25',store_code:'SOGA'},
    {date:'2026-11-26',staff_code:'SAKAKI',start_time:'10:15',end_time:'11:00',assignment_type:'SHIFT',shift_id:'morning26',store_code:'SOGA'},
    row('2026-11-24','SAKAKI',0), row('2026-11-27','KEVIN',0), row('2026-11-25','OTHER',0)
  ];
  const board = {slots, assignments, staff: [
    {staff_code:'KEVIN',staff_name:'KEVIN',display_name:'Kevin',active:true},
    {staff_code:'KAWAKAMI',staff_name:'川上 一郎',display_name:'川上一郎',active:true},
    {staff_code:'SAKAKI',staff_name:'榊 太郎',display_name:'榊',active:true},
    {staff_code:'OTHER',staff_name:'その他',active:true}
  ]};
  return {board, shifts: structuredClone(assignments), slots, row};
}
module.exports = {fixture};
