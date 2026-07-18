function enhanceAuth(){
 const form=document.querySelector('[data-auth-form]');if(!form||form.dataset.enhanced)return;form.dataset.enhanced='true';
 const fullName=form.elements.fullName,username=form.elements.username,email=form.elements.email,password=form.elements.password;
 if(fullName)fullName.placeholder='e.g. Aarya Mehta';
 if(username){username.placeholder='@aarya_mehta';username.pattern='@?[a-zA-Z0-9_]{3,24}';username.title='Use 3–24 letters, numbers, or underscores. The @ is optional.'}
 if(email)email.placeholder='you@example.com';
 if(password){password.placeholder=fullName?'At least 8 characters':'Enter your password';password.autocomplete=fullName?'new-password':'current-password';const wrap=document.createElement('div');wrap.className='password-field';password.parentNode.insertBefore(wrap,password);wrap.append(password);const button=document.createElement('button');button.type='button';button.className='password-toggle';button.setAttribute('aria-label','Show password');button.innerHTML='<i class="fa-solid fa-eye" aria-hidden="true"></i>';button.addEventListener('click',()=>{const show=password.type==='password';password.type=show?'text':'password';button.setAttribute('aria-label',show?'Hide password':'Show password');button.innerHTML=`<i class="fa-solid fa-eye${show?'-slash':''}" aria-hidden="true"></i>`});wrap.append(button)}
 const picker=form.querySelector('.account-picker');if(picker&&!picker.querySelector('[value="organisation"]')){const label=document.createElement('label');label.innerHTML='<input type="radio" name="accountType" value="organisation"> Organisation';picker.append(label)}
 if(username&&!form.querySelector('.form-hint')){const hint=document.createElement('small');hint.className='form-hint';hint.textContent='People find you using this unique username.';username.closest('.field').after(hint)}
}
new MutationObserver(enhanceAuth).observe(document.querySelector('#app'),{childList:true,subtree:true});enhanceAuth();
document.addEventListener('submit',event=>{if(!event.target.matches('[data-auth-form]'))return;const username=event.target.elements.username;if(username)username.value=username.value.trim().replace(/^@/,'').toLowerCase()},true);
